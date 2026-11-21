import csv
import io
import os
import tempfile
from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from dietary.catalog import get_catalog
from .models import Restaurant, Menu, AllergenLink, CatalogSource, FoodDeclaration
from .allergen_import import match_rows


@override_settings(CATALOG_USE_DB=True)
class AllergenImportTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.allergens = os.path.join(self.directory.name, 'allergens.csv')
        self.brands = os.path.join(self.directory.name, 'brands.csv')
        self.restaurant = Restaurant.objects.create(place_id='123', name='맘스터치 테스트점')
        self.menu = Menu.objects.create(preprocess_row_id='stable-menu', restaurant=self.restaurant, name='치킨')
        self.row = {'brand': '맘스터치', 'menu_name_raw': '치킨', 'menu_id': 'external-id',
            'allergens_contains_normalized': '우유,새우', 'verification_status': 'manual_visual_checked',
            'allergen_declaration_scope': 'menu', 'source_url': 'https://momstouch.co.kr/menu',
            'source_reference_date': (timezone.localdate() - timedelta(days=1)).isoformat()}
        self.write(self.allergens, [self.row])
        self.write(self.brands, [{'place_id': '1.23E2', '브랜드': '맘스터치'}])

    def write(self, path, rows):
        with open(path, 'w', encoding='utf-8-sig', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

    def run_import(self, **kwargs):
        call_command('import_catalog_allergens', allergens=self.allergens, brand_restaurants=self.brands,
                     stdout=io.StringIO(), **kwargs)

    def test_exact_mapping_idempotent_and_positive_only(self):
        self.run_import(dry_run=True)
        self.assertFalse(AllergenLink.objects.exists())
        self.run_import()
        self.run_import()
        self.assertEqual(AllergenLink.objects.count(), 1)
        self.assertEqual(CatalogSource.objects.count(), 1)
        self.assertEqual(FoodDeclaration.objects.count(), 3)
        component = get_catalog().get_component(self.menu.pk)
        self.assertEqual(component['present_tags'], ['crustacean', 'milk', 'shrimp'])
        self.assertEqual(component['absent_tags'], [])
        detail = self.client.get('/api/menus/' + self.menu.pk).json()
        ref = detail['allergen_information']['brand_reference']
        self.assertEqual(ref['external_menu_id'], 'external-id')
        self.assertEqual(ref['status'], 'verified_source')
        self.assertTrue(all(d['applicability_scope'] == 'brand_menu_reference:menu'
            for d in detail['allergen_information']['declarations']))
        self.assertEqual(detail['branch_sale_status'], 'unverified')
        self.menu.name = '새 메뉴'
        self.menu.save()
        self.assertEqual(get_catalog().get_component(self.menu.pk)['present_tags'], [])

    def test_unverified_missing_date_and_partial_scope_remain_reference(self):
        for overrides in [{'verification_status': 'source_structure_checked'},
                          {'source_reference_date': ''}, {'allergen_declaration_scope': 'components'},
                          {'source_url': 'https://momstouch.co.kr.example.com/menu'}]:
            with self.subTest(overrides=overrides):
                self.write(self.allergens, [dict(self.row, **overrides)])
                self.run_import()
                self.assertEqual(get_catalog().get_component(self.menu.pk)['present_tags'], [])
                self.assertEqual(AllergenLink.objects.get().status, 'reference')

    def test_ambiguous_and_no_fuzzy_matching_downgrade_only_imports(self):
        self.run_import()
        manual = FoodDeclaration.objects.create(menu=self.menu, kind='ingredient', name_raw='수동 근거',
                                                canonical_tag='egg', presence='unknown')
        self.write(self.allergens, [self.row, dict(self.row, menu_id='other-source')])
        self.run_import()
        self.assertEqual(AllergenLink.objects.get().status, 'inactive')
        self.assertEqual(get_catalog().get_component(self.menu.pk)['present_tags'], [])
        self.assertTrue(FoodDeclaration.objects.filter(pk=manual.pk).exists())
        self.write(self.allergens, [dict(self.row, menu_name_raw='치킨(소)')])
        matches, stats = match_rows([{'menu_id': self.menu.pk, 'menu_name': self.menu.name,
            'restaurant_id': self.restaurant.pk}], self.allergens, self.brands)
        self.assertEqual(matches, [])
        self.assertEqual(stats['no_exact_menu'], 1)

    def test_brand_conflict_is_not_guessed(self):
        self.write(self.brands, [{'place_id': '123', '브랜드': '맘스터치'}, {'place_id': '123.0', '브랜드': '다른브랜드'}])
        self.run_import()
        self.assertFalse(AllergenLink.objects.exists())
