import json
import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from .models import Criterion, Profile, Review
from .services import check_order, evaluate, rank_menus


class DietaryTests(TestCase):
    # 식이 판정·세션별 개인 활동 기본 검증
    def setUp(self):
        self.profile = Profile.objects.create(guest_id=uuid.uuid4())
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.catalog = patch('dietary.services.get_catalog').start().return_value
        self.addCleanup(patch.stopall)
        # 성분 판정 단위 테스트와 주문 관계 검증의 경계 분리
        patch('dietary.services.validate_selection', return_value={'status': 'valid', 'unknown_items': []}).start()
        self.data = {
            'yes': {'present_tags': ['milk'], 'absent_tags': [], 'sources': [{'id': 's1'}]},
            'no': {'present_tags': [], 'absent_tags': ['milk'], 'sources': [{'id': 's2'}]},
            'unknown': {'present_tags': [], 'absent_tags': [], 'sources': [{'id': 's3'}]},
        }
        self.catalog.get_component.side_effect = self.data.get

    def send(self, client, method, path, body):
        return getattr(client, method)(path, json.dumps(body), content_type='application/json')

    def test_temporary_criteria_preserve_profile(self):
        self.profile.criteria.clear()
        result = evaluate(self.profile, 'yes', criteria=['allergen-milk'])
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual(result['reasons'][0]['condition'], 'allergen-milk')
        self.assertEqual(rank_menus(self.profile, ['yes'], criteria=['allergen-milk'])[0]['status'], 'mismatch')
        self.assertFalse(self.profile.criteria.exists())
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.assertEqual(evaluate(self.profile, 'yes', criteria=[])['status'], 'match')
        self.assertEqual(evaluate(self.profile, 'yes')['status'], 'mismatch')
        self.assertEqual(evaluate(self.profile, 'yes', ['remove-milk'])['status'], 'mismatch')
        for codes in (['unknown-code'], 'allergen-milk'):
            with self.assertRaises(ValueError):
                evaluate(self.profile, 'yes', criteria=codes)

    def test_absence_is_not_evidence(self):
        self.assertEqual(evaluate(self.profile, 'unknown')['status'], 'needs_check')
        self.assertEqual(evaluate(self.profile, 'missing')['status'], 'needs_check')
        self.assertEqual(evaluate(self.profile, 'no')['status'], 'match')
        self.assertEqual(evaluate(self.profile, 'yes')['status'], 'mismatch')
        self.data['no']['sources'] = []
        self.assertEqual(evaluate(self.profile, 'no')['status'], 'needs_check')

    def test_combinations_and_unverified_removal(self):
        for second, expected in [('no', 'match'), ('unknown', 'needs_check'), ('yes', 'mismatch')]:
            result = check_order(self.profile, [{'id': 'no', 'role': 'menu'}, {'id': second, 'role': 'sauce'}])
            self.assertEqual(result['status'], expected)
            self.assertEqual(len(result['components']), 2)
        self.assertEqual(evaluate(self.profile, 'yes', ['remove-milk'])['status'], 'mismatch')
        self.assertEqual(evaluate(self.profile, 'no', ['remove-milk'])['status'], 'needs_check')

    def test_legacy_preference_does_not_affect_ranking(self):
        self.profile.criteria.add(Criterion.objects.get(code='prefer-korean'))
        self.data['yes']['preference_tags'] = ['prefer-korean']
        self.assertEqual([r['component_id'] for r in rank_menus(self.profile, ['yes', 'unknown', 'no'])], ['no', 'unknown', 'yes'])
        self.data['no2'] = dict(self.data['no'], preference_tags=['prefer-korean'])
        self.assertEqual(rank_menus(self.profile, ['no', 'no2'])[0]['component_id'], 'no')

    def test_guest_ownership_and_favorites_recalculation(self):
        a, b = Client(), Client()
        self.send(a, 'put', '/api/profile', {'criteria': ['allergen-milk']})
        f = self.send(a, 'post', '/api/favorites', {'menu_id': 'yes'}).json()
        self.assertEqual(self.send(a, 'post', '/api/favorites', {'menu_id': 'yes'}).status_code, 200)
        self.assertEqual(b.get('/api/favorites').json()['favorites'], [])
        self.assertEqual(b.delete(f'/api/favorites/{f["id"]}').status_code, 404)
        self.assertEqual(a.get('/api/favorites').json()['favorites'][0]['judgement']['status'], 'mismatch')
        self.send(a, 'put', '/api/profile', {'criteria': []})
        self.assertEqual(a.get('/api/favorites').json()['favorites'][0]['judgement']['status'], 'match')
        self.data.pop('yes')
        self.assertEqual(a.get('/api/favorites').json()['favorites'][0]['judgement']['status'], 'needs_check')

    def test_reviews_ownership_consent_and_snapshot(self):
        a, b = Client(), Client()
        self.send(a, 'put', '/api/profile', {'criteria': ['allergen-milk', 'exclude-pork']})
        r = self.send(a, 'post', '/api/reviews', {'menu_id': 'yes', 'body': '경험', 'disclose_conditions': ['allergen-milk']}).json()
        self.assertEqual(len(r['disclosed_conditions']), 1)
        url = f'/api/reviews/{r["id"]}'
        self.assertEqual(self.send(b, 'patch', url, {'body': '수정'}).status_code, 404)
        self.assertEqual(b.delete(url).status_code, 404)
        self.send(a, 'put', '/api/profile', {'criteria': []})
        self.assertEqual(len(a.get('/api/reviews?condition=allergen-milk').json()['reviews']), 1)
        self.assertEqual(len(a.get('/api/reviews?condition=exclude-pork').json()['reviews']), 0)
        self.assertEqual(self.send(a, 'patch', url, {'body': '수정'}).status_code, 200)
        self.assertEqual(Review.objects.get(pk=r['id']).disclosed_conditions, r['disclosed_conditions'])
        self.assertEqual(evaluate(self.profile, 'yes')['status'], 'mismatch')
        self.assertEqual(a.delete(url).status_code, 200)

    def test_admin_login_does_not_change_guest_identity(self):
        a = Client()
        self.send(a, 'put', '/api/profile', {'criteria': ['exclude-pork']})
        a.force_login(get_user_model().objects.create_user(username='admin'))
        self.assertEqual(a.get('/api/profile').json()['criteria'], ['exclude-pork'])

    def test_diet_requires_every_tag_and_supported_rules(self):
        self.profile.criteria.set([Criterion.objects.get(code='vegan')])
        self.assertEqual(evaluate(self.profile, 'no')['status'], 'needs_check')
        rule = Criterion.objects.get(code='vegan').rule
        self.data['vegan'] = {'present_tags': [], 'absent_tags': rule.excluded_tags, 'sources': [{'id': 's4'}]}
        self.assertEqual(evaluate(self.profile, 'vegan')['status'], 'match')
        rule.enabled = False
        rule.save()
        self.assertEqual(evaluate(self.profile, 'vegan')['status'], 'needs_check')

    def test_csrf_required_and_session_bootstrap(self):
        c = Client(enforce_csrf_checks=True)
        self.assertEqual(self.send(c, 'put', '/api/profile', {'criteria': []}).status_code, 403)
        token = c.get('/api/session').json()['csrf_token']
        self.assertEqual(c.put('/api/profile', json.dumps({'criteria': []}), content_type='application/json', HTTP_X_CSRFTOKEN=token).status_code, 200)

    def test_validation_and_templates(self):
        c = Client()
        for body in [{'criteria': ['bad']}, {'criteria': 'milk'}]:
            self.assertEqual(self.send(c, 'put', '/api/profile', body).status_code, 400)
        self.assertEqual(self.send(c, 'post', '/api/orders/check', {'components': []}).status_code, 400)
        self.assertEqual(self.send(c, 'post', '/api/orders/check', {'components': [None]}).status_code, 400)
        self.send(c, 'put', '/api/profile', {'criteria': ['allergen-milk']})
        response = self.send(c, 'post', '/api/communication', {'components': [{'id': 'unknown', 'role': 'menu'}]}).json()
        self.assertIn('알레르기: 우유', response['text'])
        self.assertIn('우유 포함 여부 확인 필요', response['text'])
        self.assertNotIn('allergen-milk:milk', response['text'])
        self.assertEqual(len(c.get('/api/allergens').json()['allergens']), 17)

    def test_profile_admin_requires_permission(self):
        from django.contrib.admin.sites import site
        from django.test import RequestFactory
        request = RequestFactory().get('/admin/')
        request.user = get_user_model().objects.create_user(username='staff', is_staff=True)
        model_admin = site._registry[Profile]
        self.assertFalse(model_admin.has_module_permission(request))
        self.assertFalse(model_admin.has_view_permission(request))
