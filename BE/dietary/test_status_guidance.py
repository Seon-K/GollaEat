"""사용자 화면용 판정 근거 및 확인 안내 검증"""
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from catalog.models import AllergenLink, CatalogSource, FoodDeclaration, Menu, MenuAnalysisReference, Restaurant
from .models import Criterion, Profile
from .services import check_order, evaluate


@override_settings(CATALOG_USE_DB=True, DIETARY_CATALOG_ADAPTER='catalog.adapters.DietaryCatalog')
class StatusGuidanceTests(TestCase):
    def test_no_conditions_match_without_reading_missing_or_malformed_evidence(self):
        self.profile.criteria.clear()
        with patch('dietary.services.get_catalog', side_effect=AssertionError('no restrictions need no evidence')):
            for component_id in (self.menu.pk, 'missing-menu'):
                result = evaluate(self.profile, component_id)
                self.assertEqual(result['status'], 'match')
                self.assertEqual(result['unknown_items'], [])
                self.assertEqual(result['guidance']['basis'], 'no_restrictions')
                self.assertIn('확인했다는 의미는 아닙니다', result['guidance']['message'])

    def setUp(self):
        self.client.get('/api/session')
        self.profile = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        self.profile.criteria.set(Criterion.objects.filter(code='allergen-milk'))
        store = Restaurant.objects.create(place_id='guidance-store', name='테스트점', brand='맘스터치')
        self.menu = Menu.objects.create(preprocess_row_id='guidance-menu', name='테스트 메뉴', restaurant=store)
        self.source = CatalogSource.objects.create(title='공식 자료', source_type='official',
            url='https://momstouch.co.kr/menu', checked_at=timezone.now())

    def official(self, raw='밀, 대두'):
        return AllergenLink.objects.create(menu=self.menu, external_menu_id='external-guidance',
            brand='맘스터치', status='reference', source=self.source,
            payload={'menu_name_raw': self.menu.name, 'allergen_declaration_scope': 'menu',
                     'allergens_contains_normalized': raw})

    def analysis(self, **kwargs):
        return MenuAnalysisReference.objects.create(menu=self.menu, source_filename='test.csv',
            source_sha256='a' * 64, ingredient_source='TEST', evidence_level='TEST', information_status='TEST', **kwargs)

    def test_official_match_reports_display_information_and_store_confirmation(self):
        self.official()
        result = evaluate(self.profile, self.menu.pk)
        self.assertEqual(result['status'], 'match')
        self.assertEqual(result['guidance']['basis'], 'official_allergen_list')
        self.assertEqual(result['guidance']['message'],
            '공식 홈페이지의 알레르겐 정보에 선택한 제한 성분이 기재되어 있지 않습니다.')
        self.assertIn('주문 전 매장에 한 번 더 확인', result['guidance']['notice'])
        self.assertIn('교차접촉', result['guidance']['notice'])

    def test_no_restrictions_does_not_claim_official_evidence(self):
        self.profile.criteria.clear()
        result = evaluate(self.profile, self.menu.pk)
        self.assertEqual(result['status'], 'match')
        self.assertEqual(result['guidance']['basis'], 'no_restrictions')
        self.assertNotIn('공식', result['guidance']['message'])

    def test_missing_evidence_does_not_use_match_message(self):
        result = evaluate(self.profile, self.menu.pk)
        self.assertEqual(result['status'], 'needs_check')
        self.assertEqual(result['guidance']['basis'], 'insufficient_information')
        self.assertIn('정보가 부족', result['guidance']['message'])

    def test_gemini_estimate_is_exclusion_and_not_confirmed_presence(self):
        self.official()
        self.analysis(gemini_estimated_ingredients=['치즈'])
        result = evaluate(self.profile, self.menu.pk)
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual(result['guidance']['basis'], 'gemini_estimated')
        self.assertIn('추정', result['guidance']['message'])
        self.assertIn('확인되지 않았습니다', result['guidance']['message'])
        self.assertEqual(result['reasons'][0]['verified_problem_ingredients'], [])

    def test_verified_qwen_and_mixed_evidence_have_distinct_guidance(self):
        link = self.official('우유, 밀')
        self.assertEqual(evaluate(self.profile, self.menu.pk)['guidance']['basis'], 'verified_presence')
        self.analysis(explicit_ingredients=['치즈'])
        self.assertEqual(evaluate(self.profile, self.menu.pk)['guidance']['basis'], 'verified_and_ai')
        link.delete()
        result = evaluate(self.profile, self.menu.pk)
        self.assertEqual(result['guidance']['basis'], 'qwen_extracted')
        self.assertEqual(result['status'], 'mismatch')

    def test_other_restrictions_do_not_claim_official_allergen_list(self):
        self.profile.criteria.set(Criterion.objects.filter(code='exclude-honey'))
        FoodDeclaration.objects.create(menu=self.menu, kind='ingredient', name_raw='꿀', canonical_tag='honey',
            presence='absent', verification_status='verified', confirmed_at=timezone.now(), source=self.source)
        result = evaluate(self.profile, self.menu.pk)
        self.assertEqual(result['status'], 'match')
        self.assertEqual(result['guidance']['basis'], 'verified_information')

    def test_guidance_is_shared_by_detail_search_favorites_rank_and_order(self):
        self.official()
        body = {'menu_id': self.menu.pk}
        self.client.post('/api/favorites', body, content_type='application/json')
        expected = self.client.post('/api/judgements', body, content_type='application/json').json()
        detail = self.client.get(f'/api/menus/{self.menu.pk}?personalize=true').json()['judgement']
        listing = self.client.get('/api/menus?sort=dietary&personalize=true').json()['results'][0]['judgement']
        favorite = self.client.get('/api/favorites').json()['favorites'][0]['judgement']
        ranked = self.client.post('/api/recommendations/rank', {'menu_ids': [self.menu.pk]},
                                  content_type='application/json').json()['results'][0]
        for actual in [detail, listing, favorite, ranked]:
            self.assertEqual(actual, expected)
        order = check_order(self.profile, [{'id': self.menu.pk, 'role': 'menu'}])
        self.assertEqual(order['guidance'], expected['guidance'])
        self.assertEqual(order['components'][0]['guidance'], expected['guidance'])
        with patch('dietary.services.validate_selection', return_value={'status': 'needs_check', 'unknown_items': ['option_catalog_unavailable']}):
            order = check_order(self.profile, [{'id': self.menu.pk, 'role': 'menu'}])
        self.assertEqual(order['status'], 'needs_check')
        self.assertEqual(order['guidance']['basis'], 'insufficient_information')
