import uuid
from unittest.mock import patch

from django.test import Client, TestCase

from .models import Criterion, Favorite, Profile, Review
from .services import check_order, communication, evaluate, rank_menus


class ReviewOwnershipTests(TestCase):
    # 세션 소유권 기반 본인 표시·내 리뷰 필터 검증
    def setUp(self):
        self.client.get('/api/session')
        self.profile = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        self.other = Profile.objects.create(guest_id=uuid.uuid4())
        self.milk = [{'code': 'allergen-milk', 'name': '우유', 'kind': 'allergen'}]
        self.own = Review.objects.create(profile=self.profile, menu_id='menu', body='mine', disclosed_conditions=self.milk)
        self.theirs = Review.objects.create(profile=self.other, menu_id='menu', body='other', disclosed_conditions=self.milk)

    def test_list_and_detail_is_mine_without_identity_disclosure(self):
        data = self.client.get('/api/reviews').json()['reviews']
        self.assertEqual({r['id']: r['is_mine'] for r in data}, {self.own.pk: True, self.theirs.pk: False})
        self.assertTrue(self.client.get(f'/api/reviews/{self.own.pk}').json()['is_mine'])
        self.assertFalse(Client().get(f'/api/reviews/{self.own.pk}').json()['is_mine'])
        for r in data:
            self.assertNotIn('profile', r)
            self.assertNotIn('guest_id', r)
        visitor = Client()
        self.assertTrue(all(not r['is_mine'] for r in visitor.get('/api/reviews').json()['reviews']))
        self.assertNotIn('dietary_owner', visitor.session)

    def test_mine_combines_snapshot_menu_and_pagination(self):
        Review.objects.create(profile=self.profile, menu_id='other-menu', body='other menu', disclosed_conditions=self.milk)
        Review.objects.create(profile=self.profile, menu_id='menu', body='no snapshot')
        newest = Review.objects.create(profile=self.profile, menu_id='menu', body='new', disclosed_conditions=self.milk)
        response = self.client.get('/api/reviews?mine=true&menu_id=menu&condition=allergen-milk&limit=1').json()
        self.assertEqual(response['pagination']['total'], 2)
        self.assertEqual(response['reviews'][0]['id'], newest.pk)
        second = self.client.get('/api/reviews?mine=true&menu_id=menu&condition=allergen-milk&limit=1&page=2').json()
        self.assertEqual(second['reviews'][0]['id'], self.own.pk)
        self.assertEqual(Client().get('/api/reviews?mine=true').json()['reviews'], [])
        self.assertEqual(self.client.get('/api/reviews?mine=invalid').status_code, 400)
        self.assertEqual(len(self.client.get('/api/reviews?mine=false').json()['reviews']), 5)

    def test_create_edit_and_delete_enforce_server_ownership(self):
        result = self.client.post('/api/reviews', {'menu_id': 'menu', 'body': 'new', 'is_mine': False}, content_type='application/json')
        self.assertEqual(result.status_code, 201)
        self.assertTrue(result.json()['is_mine'])
        result = self.client.patch(f'/api/reviews/{self.own.pk}', {'body': 'edit'}, content_type='application/json')
        self.assertTrue(result.json()['is_mine'])
        self.assertEqual(self.client.patch(f'/api/reviews/{self.theirs.pk}', {'body': 'edit', 'is_mine': True}, content_type='application/json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/reviews/{self.theirs.pk}').status_code, 404)


class EvaluationQueryTests(TestCase):
    # 판정 결과 유지 및 기준 조회 횟수 검증
    def setUp(self):
        # 기준 조회 횟수 검증과 별도 주문 관계 조회의 분리
        selection = patch('dietary.services.validate_selection', return_value={'status': 'valid', 'unknown_items': []})
        selection.start()
        self.addCleanup(selection.stop)
        self.profile = Profile.objects.create(guest_id=uuid.uuid4())
        self.profile.criteria.set(Criterion.objects.filter(code__in=['allergen-milk', 'exclude-pork', 'prefer-korean']))
        self.data = {
            'ok': {'present_tags': [], 'absent_tags': ['milk', 'pork'], 'sources': [{'id': 's'}]},
            'bad': {'present_tags': ['milk'], 'absent_tags': ['pork'], 'sources': [{'id': 's'}]},
            'unknown': {'present_tags': [], 'absent_tags': [], 'sources': []},
        }
        self.catalog = patch('dietary.services.get_catalog').start().return_value
        self.catalog.get_component.side_effect = self.data.get
        self.addCleanup(patch.stopall)

    def test_ranking_queries_are_constant_and_results_unchanged(self):
        expected = sorted([evaluate(self.profile, mid) for mid in self.data], key=lambda r: r['sort_key'])
        with self.assertNumQueries(1):
            self.assertEqual(rank_menus(self.profile, list(self.data)), expected)
        with self.assertNumQueries(1):
            result = rank_menus(self.profile, ['ok'] * 100)
        self.assertEqual(len(result), 100)
        self.assertTrue(all(r['status'] == 'match' for r in result))

    def test_order_and_communication_share_one_snapshot(self):
        parts = [{'id': mid, 'role': 'menu'} for mid in self.data]
        expected = [evaluate(self.profile, mid) for mid in self.data]
        with self.assertNumQueries(1):
            order = check_order(self.profile, parts)
        self.assertEqual(order['status'], 'mismatch')
        self.assertEqual(order['components'], [dict(r, role='menu') for r in expected])
        # 판정 기준 1회 + 메뉴 표시 정보 1회
        with self.assertNumQueries(2):
            self.assertEqual(communication(self.profile, parts)['status'], 'mismatch')

    def test_next_call_reads_updated_profile_and_rule(self):
        self.assertEqual(rank_menus(self.profile, ['bad'])[0]['status'], 'mismatch')
        self.profile.criteria.clear()
        self.assertEqual(rank_menus(self.profile, ['bad'])[0]['status'], 'match')
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        rule = Criterion.objects.get(code='allergen-milk').rule
        rule.enabled = False
        rule.save()
        self.assertEqual(rank_menus(self.profile, ['ok'])[0]['status'], 'needs_check')
        self.assertEqual(rank_menus(self.profile, ['bad'], criteria=[])[0]['status'], 'match')

    def test_favorite_page_uses_one_rule_query(self):
        self.client.get('/api/session')
        owner = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        owner.criteria.set(self.profile.criteria.all())
        Favorite.objects.bulk_create([Favorite(profile=owner, menu_id=str(i)) for i in range(20)])
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as queries:
            result = self.client.get('/api/favorites?limit=20')
        self.assertEqual(len(result.json()['favorites']), 20)
        rule_queries = [q for q in queries if 'dietary_supportrule' in q['sql']]
        self.assertEqual(len(rule_queries), 1)
