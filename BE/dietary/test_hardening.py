import uuid
from unittest.mock import patch

from django.test import TestCase, Client

from .models import Criterion, Favorite, Profile, Review
from .services import evaluate, check_order, rank_menus


class HardeningTests(TestCase):
    # 입력 오류·페이지 필터·타인 데이터 접근 차단 검증
    def setUp(self):
        self.client.get('/api/session')
        self.profile = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.other = Profile.objects.create(guest_id=uuid.uuid4())

    def test_unknown_messages_preserve_codes_and_do_not_expose_unknown_tags(self):
        with patch('dietary.services.get_catalog') as catalog:
            catalog.return_value.get_component.return_value = {'present_tags': [], 'absent_tags': [], 'sources': []}
            result = evaluate(self.profile, 'menu')
            self.assertIn('allergen-milk:milk', result['unknown_items'])
            self.assertIn('우유 포함 여부 확인 필요', result['unknown_messages'])
            self.assertIn('우유 관련 정보 출처 확인 필요', result['unknown_messages'])
            rule = Criterion.objects.get(code='allergen-milk').rule
            rule.excluded_tags = ['internal-new-tag']
            rule.save()
            result = evaluate(self.profile, 'menu')
            self.assertIn('우유 관련 재료 포함 여부 확인 필요', result['unknown_messages'])
            self.assertNotIn('internal-new-tag', ' '.join(result['unknown_messages']))

    def test_adapter_malformed_data_cannot_match(self):
        with patch('dietary.services.get_catalog') as catalog:
            for data in [[], 'milk', {'absent_tags': 'milk'}, {'present_tags': [{}]},
                         {'absent_tags': ['milk'], 'sources': [{}]},
                         {'absent_tags': ['milk'], 'sources': 'official'}]:
                with self.subTest(data=data):
                    catalog.return_value.get_component.return_value = data
                    result = evaluate(self.profile, 'menu')
                    self.assertEqual(result['status'], 'needs_check')
                    self.assertIn('invalid_component_data', result['unknown_items'])
            catalog.return_value.get_component.return_value = {
                'present_tags': ['milk'], 'absent_tags': ['milk'], 'sources': [{}]}
            self.assertEqual(evaluate(self.profile, 'menu')['status'], 'mismatch')

    def test_service_inputs_rejected_before_catalog_access(self):
        with patch('dietary.services.get_catalog') as catalog:
            for mid in ['', '   ', None, ['menu'], 'x' * 101]:
                with self.assertRaises(ValueError):
                    evaluate(self.profile, mid)
            for mods in ['remove', [None], [' ']]:
                with self.assertRaises(ValueError):
                    evaluate(self.profile, 'menu', mods)
            for values in [[], [None], [{'id': 'menu', 'role': 'bad'}]]:
                with self.assertRaises(ValueError):
                    check_order(self.profile, values)
            with self.assertRaises(ValueError):
                rank_menus(self.profile, ['menu'] * 101)
            catalog.assert_not_called()

    def test_favorite_pagination_is_scoped_and_only_evaluates_page(self):
        for index in range(5):
            Favorite.objects.create(profile=self.profile, menu_id=f'm{index}')
        Favorite.objects.create(profile=self.other, menu_id='private')
        with patch('dietary.views.evaluate', return_value={'status': 'needs_check'}) as judge:
            result = self.client.get('/api/favorites?page=2&limit=2').json()
            self.assertEqual([f['menu_id'] for f in result['favorites']], ['m2', 'm1'])
            self.assertEqual(judge.call_count, 2)
            self.assertEqual(result['pagination'], {'page': 2, 'limit': 2, 'count': 2, 'total': 5,
                'total_pages': 3, 'next_page': 3, 'previous_page': 1})
            self.assertEqual(self.client.get('/api/favorites?page=99').json()['favorites'], [])

    def test_review_snapshot_filter_before_pagination(self):
        milk = {'code': 'allergen-milk', 'name': '우유', 'kind': 'allergen'}
        pork = {'code': 'exclude-pork', 'name': '돼지고기', 'kind': 'ingredient'}
        for i, snapshot in enumerate([[milk], [milk, pork], [], [milk, pork], [pork]]):
            Review.objects.create(profile=self.other, menu_id='menu', body=str(i), disclosed_conditions=snapshot)
        response = self.client.get('/api/reviews?condition=allergen-milk&condition=exclude-pork&limit=1&page=2').json()
        self.assertEqual(response['pagination']['total'], 2)
        self.assertEqual(response['reviews'][0]['body'], '1')
        self.assertEqual(self.client.get('/api/reviews?condition=allergen-milk%27').json()['pagination']['total'], 0)
        self.assertEqual(self.client.get('/api/reviews?menu_id=missing').json()['reviews'], [])

    def test_invalid_pagination_and_json(self):
        for path in ['/api/reviews', '/api/favorites']:
            for query in ['page=0', 'page=-1', 'page=abc', 'limit=101', 'limit=0', 'page=1.5']:
                self.assertEqual(self.client.get(path + '?' + query).status_code, 400)
        for payload in ['{', 'null', '[]', '{"menu_id":"   "}']:
            self.assertEqual(self.client.post('/api/judgements', payload, content_type='application/json').status_code, 400)

    def test_owner_cannot_be_overridden_and_disclosure_cannot_be_forged(self):
        f = Favorite.objects.create(profile=self.other, menu_id='secret')
        review = Review.objects.create(profile=self.other, menu_id='menu', body='original')
        spoof = {'profile': str(self.other.pk), 'guest_id': str(self.other.guest_id), 'body': 'changed'}
        self.assertEqual(self.client.patch(f'/api/reviews/{review.pk}', spoof, content_type='application/json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/favorites/{f.pk}', spoof, content_type='application/json').status_code, 404)
        review.refresh_from_db()
        self.assertEqual(review.body, 'original')
        response = self.client.post('/api/reviews', {'menu_id': 'menu', 'body': 'test',
            'disclose_conditions': ['exclude-pork']}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        own = Review.objects.create(profile=self.profile, menu_id='menu', body='own')
        self.client.patch(f'/api/reviews/{own.pk}', {'body': 'edited', 'profile': str(self.other.pk),
            'disclosed_conditions': [{'code': 'exclude-pork'}]}, content_type='application/json')
        own.refresh_from_db()
        self.assertEqual(own.profile, self.profile)
        self.assertEqual(own.disclosed_conditions, [])
        token = Client(enforce_csrf_checks=True)
        self.assertEqual(token.delete(f'/api/reviews/{own.pk}').status_code, 403)
