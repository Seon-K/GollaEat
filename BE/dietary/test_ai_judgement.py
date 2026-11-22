from datetime import timedelta
from unittest.mock import patch

from django.test import Client, TestCase, override_settings
from django.utils import timezone

from catalog.models import (AllergenLink, CatalogSource, FoodDeclaration, Menu,
                            MenuAnalysisReference, MenuComponent, Restaurant)
from catalog.db_repository import DatabaseCatalogRepository
from .ingredient_tags import ingredient_tags
from .models import Criterion, Profile
from .services import evaluate, rank_menus


@override_settings(CATALOG_USE_DB=True, DIETARY_CATALOG_ADAPTER='catalog.adapters.DietaryCatalog')
class AIJudgementTests(TestCase):
    # Qwen·Gemini 불일치 정책 및 공식 알레르겐 정보 통합 검증
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.token = self.client.get('/api/session').json()['csrf_token']
        self.profile = Profile.objects.get(guest_id=self.client.session['dietary_owner'])
        self.profile.criteria.set(Criterion.objects.filter(code__in=['allergen-shrimp', 'allergen-soy']))
        self.restaurant = Restaurant.objects.create(place_id='r', name='맘스터치 A점', brand='맘스터치')
        self.menu = Menu.objects.create(preprocess_row_id='m', name='싸이버거', restaurant=self.restaurant)
        self.source = CatalogSource.objects.create(title='공식 메뉴 성분표', source_type='official',
            url='https://example.com/official', checked_at=timezone.now() - timedelta(days=1))

    def analysis(self, ingredients=None, estimates=None, **kwargs):
        return MenuAnalysisReference.objects.create(menu=self.menu,
            explicit_ingredients=ingredients or [], gemini_estimated_ingredients=estimates or [],
            ingredient_source='QWEN_TEXT_EXTRACTION' if ingredients else 'GEMINI_ESTIMATED',
            evidence_level='DESCRIPTION_SUPPORTED', information_status='TEXT_EVIDENCE_ONLY',
            source_filename='analysis.csv', source_sha256='a' * 64, **kwargs)

    def official(self, raw='난류, 우유, 밀', **kwargs):
        payload = {'menu_name_raw': self.menu.name, 'allergens_contains_normalized': raw,
                   'allergen_declaration_scope': 'menu', 'verification_status': 'official_image_visual_checked'}
        payload.update(kwargs)
        return AllergenLink.objects.create(menu=self.menu, external_menu_id='brand-m', brand='맘스터치',
            status='verified_source', source=self.source, payload=payload)

    def post(self, path, data):
        return self.client.post(path, data, content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def verdict(self):
        return evaluate(self.profile, self.menu.pk)

    def test_qwen_matches_either_restriction_with_original_evidence(self):
        self.analysis(['새우', '양파', '대두'])
        result = self.verdict()
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual(result['problem_ingredients'], ['shrimp', 'soy'])
        self.assertEqual({e['origin'] for e in result['ai_evidence']}, {'qwen'})
        self.assertTrue(all(not e['verified'] for e in result['ai_evidence']))
        self.assertEqual(result['ai_evidence'][0]['source']['filename'], 'analysis.csv')
        self.assertEqual(result['sources'], [])
        self.assertEqual(result['reasons'][0]['verified_problem_ingredients'], [])
        self.assertFalse(FoodDeclaration.objects.exists())

    def test_gemini_estimates_trigger_mismatch(self):
        self.analysis(estimates=['새우', '간장'])
        result = self.verdict()
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual({e['origin'] for e in result['ai_evidence']}, {'gemini'})
        self.assertIn('soy', result['problem_ingredients'])

    def test_explicit_qwen_component_mentions_without_hidden_recipe_inference(self):
        self.analysis(explicit_components=['새우튀김', '된장국'])
        result = self.verdict()
        self.assertEqual(result['status'], 'mismatch')
        self.assertTrue(all(e['field'] == 'components' for e in result['ai_evidence']))
        self.assertIn('shrimp', result['problem_ingredients'])
        ref = self.menu.analysis_reference
        ref.explicit_components = ['해물파전']
        ref.save()
        self.assertEqual(self.verdict()['status'], 'needs_check')

    def test_unrelated_absent_and_public_only_analysis_cannot_create_match(self):
        ref = self.analysis(['양파', '소금'], public_allergens='새우 | 대두', public_food_code='D1')
        self.assertEqual(self.verdict()['status'], 'needs_check')
        self.assertEqual(self.verdict()['ai_evidence'], [])
        ref.explicit_ingredients = []
        ref.gemini_estimated_ingredients = []
        ref.save()
        self.assertEqual(self.verdict()['status'], 'needs_check')

    def test_verified_presence_and_ai_are_both_preserved(self):
        self.analysis(estimates=['새우'])
        FoodDeclaration.objects.create(menu=self.menu, kind='allergen', name_raw='대두', canonical_tag='soy',
            presence='present', verification_status='verified', source=self.source,
            confirmed_at=timezone.now() - timedelta(hours=1))
        result = self.verdict()
        self.assertEqual(result['status'], 'mismatch')
        reasons = {r['condition']: r for r in result['reasons']}
        self.assertEqual(reasons['allergen-soy']['verified_problem_ingredients'], ['soy'])
        self.assertEqual(reasons['allergen-shrimp']['ai_problem_ingredients'], ['shrimp'])

    def test_official_franchise_allergens_can_match(self):
        self.official()
        result = self.verdict()
        self.assertEqual(result['status'], 'match')
        self.assertEqual(result['sources'][0]['interpretation'], 'official_menu_allergen_list')
        self.assertEqual(rank_menus(self.profile, ['m'])[0], result)

    def test_official_presence_is_mismatch_and_ai_wins_conflict(self):
        link = self.official('새우, 대두, 밀')
        self.assertEqual(self.verdict()['status'], 'mismatch')
        link.payload['allergens_contains_normalized'] = '난류, 우유, 밀'
        link.save()
        self.analysis(estimates=['새우'])
        self.assertEqual(self.verdict()['status'], 'mismatch')

    def test_official_scope_identity_status_and_expiry_guards(self):
        link = self.official()
        for field, value in [('allergen_declaration_scope', 'component'), ('menu_name_raw', '다른 메뉴'),
                             ('allergens_contains_normalized', ''), ('allergens_contains_normalized', '알수없는성분')]:
            with self.subTest(field=field, value=value):
                original = dict(link.payload)
                link.payload[field] = value
                link.save()
                self.assertEqual(self.verdict()['status'], 'needs_check')
                link.payload = original
        link.payload['menu_name_raw'] = self.menu.name
        link.save()
        link.status = 'reference'
        link.save()
        self.assertEqual(self.verdict()['status'], 'needs_check')
        link.status = 'verified_source'
        link.save()
        self.source.valid_until = timezone.now() - timedelta(hours=1)
        self.source.save()
        self.assertEqual(self.verdict()['status'], 'needs_check')

    def test_official_list_does_not_cover_every_ingredient_or_option(self):
        self.official()
        self.profile.criteria.set([Criterion.objects.get(code='exclude-cheese-butter')])
        self.assertEqual(self.verdict()['status'], 'needs_check')
        self.profile.criteria.set([Criterion.objects.get(code='allergen-shrimp')])
        sauce = MenuComponent.objects.create(menu=self.menu, name='선택 소스', role='sauce')
        result = self.post('/api/orders/check', {'components': [
            {'id': 'm', 'role': 'menu'}, {'id': 'component:' + str(sauce.pk), 'role': 'sauce'}]}).json()
        self.assertEqual(result['status'], 'needs_check')

    def test_endpoints_share_ai_result_and_staff_labels(self):
        self.analysis(estimates=['새우'])
        self.post('/api/favorites', {'menu_id': 'm'})
        single = self.post('/api/judgements', {'menu_id': 'm'}).json()
        detail = self.client.get('/api/menus/m?personalize=true').json()['judgement']
        listing = self.client.get('/api/menus?sort=dietary').json()['results'][0]['judgement']
        favorite = self.client.get('/api/favorites').json()['favorites'][0]['judgement']
        self.assertEqual(single, detail)
        self.assertEqual(single, listing)
        self.assertEqual(single, favorite)
        order = self.post('/api/orders/check', {'components': [{'id': 'm', 'role': 'menu'}]}).json()
        self.assertEqual(order['status'], 'mismatch')
        message = self.post('/api/communication', {'components': [{'id': 'm', 'role': 'menu'}]}).json()
        self.assertIn('AI 추정: 새우', message['text'])
        self.assertIn('실제 사용 여부 확인 필요', message['text'])
        self.assertNotIn('포함 확정', message['text'])
        self.assertEqual(self.client.get('/api/menus/m?personalize=invalid').status_code, 400)

    def test_reimport_and_profile_changes_take_effect_without_cache(self):
        ref = self.analysis(['새우'])
        self.assertEqual(rank_menus(self.profile, ['m'])[0]['status'], 'mismatch')
        ref.explicit_ingredients = ['양파']
        ref.save()
        self.assertEqual(rank_menus(self.profile, ['m'])[0]['status'], 'needs_check')
        ref.explicit_ingredients = ['새우']
        ref.save()
        self.profile.criteria.clear()
        self.assertEqual(self.verdict()['status'], 'match')

    def test_batch_and_single_official_and_ai_results_match(self):
        self.official()
        self.analysis(['대두'])
        repo = DatabaseCatalogRepository()
        self.assertEqual(repo.get_dietary_component('m'), repo.get_dietary_components(['m'])['m'])

    def test_malformed_analysis_never_produces_match(self):
        self.official()
        ref = self.analysis(['양파'])
        ref.explicit_ingredients = '새우'
        ref.save()
        self.assertEqual(self.verdict()['status'], 'needs_check')


class IngredientMappingTests(TestCase):
    def test_aliases_and_groups(self):
        for ingredient, tag in [('새우젓', 'shrimp'), ('양조 간장', 'soy'), ('대두(콩)', 'soy'),
                                ('두부', 'soy'), ('치즈', 'milk'), ('달걀', 'egg'), ('새우', 'crustacean')]:
            with self.subTest(ingredient=ingredient):
                self.assertIn(tag, ingredient_tags(ingredient))

    def test_ambiguous_substrings_and_negation_not_positive(self):
        self.assertNotIn('wheat', ingredient_tags('메밀'))
        self.assertNotIn('soy', ingredient_tags('완두콩'))
        self.assertNotIn('milk', ingredient_tags('땅콩버터'))
        self.assertIn('nuts', ingredient_tags('땅콩버터'))
        self.assertEqual(ingredient_tags('새우 없음'), set())
        self.assertEqual(ingredient_tags('우유 대체'), set())
