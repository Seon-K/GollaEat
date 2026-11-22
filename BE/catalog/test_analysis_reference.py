import csv
import io
import json
import os
import tempfile
from datetime import timedelta

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, Client, override_settings
from django.utils import timezone

from dietary.catalog import get_catalog
from dietary.models import Profile
from dietary.catalog_info import component_summaries
from chatbot.backend import BackendSearch
from .models import Menu, Restaurant, MenuAnalysisReference, FoodDeclaration, CatalogSource


@override_settings(CATALOG_USE_DB=True)
class AnalysisReferenceTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = os.path.join(self.directory.name, 'menugen_backend_final.csv')
        self.restaurant = Restaurant.objects.create(place_id='123', name='식당', address='아산시', latitude=36.78, longitude=127.05)
        self.menu = Menu.objects.create(preprocess_row_id='stable-id', restaurant=self.restaurant,
            name='메뉴', price_amount=0, data={'price_raw': '무료', 'price_amount': 0})
        self.other = Menu.objects.create(preprocess_row_id='without-analysis', restaurant=self.restaurant, name='다른 메뉴')
        self.row = {'preprocess_row_id': self.menu.pk, 'place_id': '1.23E2', 'restaurant_name': '식당',
            'menu_name': '메뉴', 'description': '원본 설명', 'explicit_ingredients': '[]', 'explicit_components': '["세트"]',
            'gemini_estimated_ingredients': '["우유"]', 'ingredient_source': 'GEMINI_ESTIMATED',
            'evidence_level': 'NO_EXPLICIT_INGREDIENT', 'information_status': 'NO_EXPLICIT_INGREDIENT',
            'gemini_status': 'success', 'top1_fd_Code': 'F1', 'public_reference_food_name': '참고 음식',
            'public_reference_allergens': '우유 | 밀', 'public_reference_allergy_raw': '참고 원문',
            'public_reference_status': 'UNVERIFIED_SIMILAR_FOOD',
            'restaurant_ingredient_verification': 'NOT_VERIFIED', 'allergy_safety_status': 'UNKNOWN_NOT_VERIFIED'}
        self.write([self.row])

    def write(self, rows):
        with open(self.path, 'w', encoding='utf-8-sig', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

    def run_import(self, **kwargs):
        call_command('import_menu_analysis', csv=self.path, stdout=io.StringIO(), **kwargs)

    def test_dry_run_upsert_preserve_menu_and_detail_only_addition(self):
        before = self.client.get('/api/menus/' + self.menu.pk).json()
        listing = self.client.get('/api/menus').json()
        snapshot = list(Menu.objects.order_by('pk').values())
        self.run_import(dry_run=True)
        self.assertFalse(MenuAnalysisReference.objects.exists())
        self.run_import()
        self.run_import()
        self.assertEqual(MenuAnalysisReference.objects.count(), 1)
        self.assertEqual(list(Menu.objects.order_by('pk').values()), snapshot)
        after = self.client.get('/api/menus/' + self.menu.pk).json()
        self.assertEqual({k: v for k, v in after.items() if k != 'analysis_reference'},
                         {k: v for k, v in before.items() if k != 'analysis_reference'})
        self.assertEqual(self.client.get('/api/menus').json(), listing)
        analysis = after['analysis_reference']
        self.assertEqual(analysis['gemini']['estimated_ingredients'], ['우유'])
        self.assertEqual(analysis['qwen']['components'], ['세트'])
        self.assertEqual(analysis['public_reference']['allergens'], '우유 | 밀')
        self.assertTrue(analysis['usable_for_dietary_judgement'])
        self.assertEqual(analysis['judgement_usage'], 'mismatch_only')
        self.assertFalse(analysis['usable_for_verified_absence'])
        self.assertEqual(analysis['source']['filename'], 'menugen_backend_final.csv')
        self.assertEqual(len(analysis['source']['sha256']), 64)
        self.assertIsNone(self.client.get('/api/menus/' + self.other.pk).json()['analysis_reference'])

    def test_qwen_blank_gemini_and_none_components_preserve_processing_status(self):
        self.write([dict(self.row, ingredient_source='QWEN_TEXT_EXTRACTION', explicit_ingredients='["우유"]',
            gemini_estimated_ingredients='', evidence_level='DESCRIPTION_SUPPORTED', information_status='TEXT_EVIDENCE_ONLY', gemini_status='')])
        self.run_import()
        ref = self.client.get('/api/menus/' + self.menu.pk).json()['analysis_reference']
        self.assertEqual(ref['qwen']['ingredients'], ['우유'])
        self.assertEqual(ref['gemini']['estimated_ingredients'], [])
        self.assertIsNone(ref['gemini']['processing_status'])
        self.write([dict(self.row, ingredient_source='NONE', gemini_estimated_ingredients='[]',
                        gemini_status='success', top1_fd_Code='', public_reference_food_name='')])
        self.run_import()
        ref = self.client.get('/api/menus/' + self.menu.pk).json()['analysis_reference']
        self.assertEqual(ref['gemini']['processing_status'], 'success')
        self.assertEqual(ref['gemini']['estimated_ingredients'], [])
        self.assertFalse(ref['public_reference']['match_present'])
        self.assertEqual(ref['qwen']['components'], ['세트'])

    def test_identity_mismatch_rejects_entire_batch_and_preserves_existing(self):
        self.run_import()
        before = MenuAnalysisReference.objects.get().source_sha256
        for changes in [{'preprocess_row_id': 'missing'}, {'place_id': '999'},
                        {'menu_name': '다른 메뉴'}, {'restaurant_name': '다른 매장'}]:
            with self.subTest(changes=changes):
                self.write([dict(self.row, **changes)])
                with self.assertRaises(CommandError):
                    self.run_import()
                self.assertEqual(MenuAnalysisReference.objects.get().source_sha256, before)
        self.write([self.row, dict(self.row, preprocess_row_id=self.other.pk, menu_name='잘못된 메뉴명')])
        with self.assertRaises(CommandError):
            self.run_import()
        self.assertEqual(MenuAnalysisReference.objects.count(), 1)

    def test_invalid_json_duplicates_and_verified_claims_rejected(self):
        for changes in [{'explicit_ingredients': '__import__("os")'},
                        {'explicit_components': '{"wrong":"type"}'},
                        {'gemini_estimated_ingredients': '[1]'},
                        {'allergy_safety_status': 'VERIFIED'},
                        {'restaurant_ingredient_verification': 'VERIFIED'},
                        {'ingredient_source': 'QWEN_TEXT_EXTRACTION'}]:
            with self.subTest(changes=changes):
                self.write([dict(self.row, **changes)])
                with self.assertRaises(CommandError):
                    self.run_import()
        self.write([self.row, self.row])
        with self.assertRaises(CommandError):
            self.run_import()
        self.assertFalse(MenuAnalysisReference.objects.exists())

    def test_ai_changes_exclusion_without_creating_verified_declarations(self):
        client = Client(enforce_csrf_checks=True)
        token = client.get('/api/session').json()['csrf_token']
        def send(path, data, method='post'):
            response = getattr(client, method)(path, json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=token)
            self.assertIn(response.status_code, [200, 201], response.content)
            return response.json()
        send('/api/profile', {'criteria': ['allergen-milk']}, 'put')
        send('/api/favorites', {'menu_id': self.menu.pk})
        profile = Profile.objects.get(guest_id=client.session['dietary_owner'])
        state = {'criteria': ['allergen-milk'], 'location': {'lat': 36.78, 'lng': 127.05}, 'radius_m': 1000}
        before = get_catalog().get_component(self.menu.pk)
        favorites = client.get('/api/favorites').json()
        summaries = component_summaries([self.menu.pk])
        chatbot = BackendSearch(profile)(dict(state))
        self.run_import()
        after = get_catalog().get_component(self.menu.pk)
        self.assertEqual({k: v for k, v in after.items() if k != 'analysis_reference'},
                         {k: v for k, v in before.items() if k != 'analysis_reference'})
        self.assertEqual(favorites['favorites'][0]['judgement']['status'], 'needs_check')
        self.assertEqual(client.get('/api/favorites').json()['favorites'][0]['judgement']['status'], 'mismatch')
        self.assertEqual(component_summaries([self.menu.pk]), summaries)
        self.assertTrue(chatbot['needs_check'])
        remaining = BackendSearch(profile)(dict(state))['needs_check']
        self.assertNotIn(self.menu.pk, [m['menu_id'] for store in remaining for m in store['menus']])
        self.assertEqual(send('/api/judgements', {'menu_id': self.menu.pk})['status'], 'mismatch')
        self.assertEqual(send('/api/recommendations/rank', {'menu_ids': [self.menu.pk]})['results'][0]['status'], 'mismatch')
        self.assertEqual(send('/api/orders/check', {'components': [{'id': self.menu.pk, 'role': 'menu'}]})['status'], 'mismatch')
        self.assertFalse(FoodDeclaration.objects.exists())
        self.assertFalse(CatalogSource.objects.exists())
        source = CatalogSource.objects.create(title='확인된 성분', source_type='store',
            url='https://example.com/source', checked_at=timezone.now() - timedelta(days=1))
        FoodDeclaration.objects.create(menu=self.menu, kind='allergen', name_raw='우유', canonical_tag='milk',
            presence='present', verification_status='verified', source=source, confirmed_at=source.checked_at)
        verified = get_catalog().get_component(self.menu.pk)
        self.run_import()
        refreshed = get_catalog().get_component(self.menu.pk)
        self.assertEqual(refreshed['present_tags'], verified['present_tags'])
        self.assertEqual(refreshed['absent_tags'], verified['absent_tags'])
        self.assertEqual(refreshed['sources'], verified['sources'])
        self.assertEqual(send('/api/judgements', {'menu_id': self.menu.pk})['status'], 'mismatch')
