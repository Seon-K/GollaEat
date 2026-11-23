from datetime import date
from unittest.mock import patch

from django.db import connection
from django.db.models.functions import Collate
from django.http import QueryDict
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext

from .db_repository import DatabaseCatalogRepository
from .models import (Restaurant, Menu, BusinessHours, Closure, CatalogSource,
                     AllergenLink, FoodDeclaration, MenuComponent, OptionGroup)
from .query_expressions import UnicodeCasefold, _fold_mapping
from .services import list_menus


@override_settings(CATALOG_USE_DB=True)
class UnicodePageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        store = Restaurant.objects.create(place_id='unicode-store', name='유니코드 식당', latitude=36.78, longitude=127.05)
        single, _, expansions = _fold_mapping()
        names = [*single, *(char for char, _ in expansions), '메뉴', '가', '힣', 'SS', 'ss', 'ß', 'ẞ',
                 'İ', 'I', 'i', 'ı', 'Σ', 'ς', 'σ', 'ﬃ', 'FFI', 'ｅ', 'é', 'é', '😀', '™', '']
        Menu.objects.bulk_create([Menu(preprocess_row_id=f'u-{index:05}', restaurant=store,
            name=name, price_amount=index if index % 3 else None) for index, name in enumerate(names)])

    def test_every_fold_mapping_and_entire_order_match_python(self):
        original = dict(Menu.objects.values_list('pk', 'name'))
        collation = 'C' if connection.vendor == 'postgresql' else 'BINARY'
        actual = list(Menu.objects.annotate(fold=UnicodeCasefold('name')).order_by(
            Collate('fold', collation), Collate('pk', collation)).values_list('pk', 'fold'))
        self.assertEqual(actual, [(pk, original[pk].casefold()) for pk in sorted(original,
            key=lambda pk: (original[pk].casefold(), pk))])

    def test_page_boundaries_and_no_candidate_scan(self):
        names = dict(Menu.objects.values_list('pk', 'name'))
        expected = sorted(names, key=lambda pk: (names[pk].casefold(), pk))
        repo = DatabaseCatalogRepository()
        with patch.object(repo, 'menu_candidates', side_effect=AssertionError('initial page must not scan candidates')):
            for limit in [7, 19, 100]:
                for page in [1, 2, (len(expected) - 1) // limit + 1, 10000]:
                    with self.subTest(limit=limit, page=page):
                        result = list_menus(QueryDict(f'limit={limit}&page={page}&lat=36.78&lng=127.05'), repo)
                        self.assertEqual([r['menu_id'] for r in result['results']], expected[(page-1)*limit:page*limit])
                        self.assertEqual(result['pagination']['total'], len(expected))
                        self.assertTrue(all(r['distance_km'] == 0 for r in result['results']))


@override_settings(CATALOG_USE_DB=True)
class RelatedReadTests(TestCase):
    def setUp(self):
        self.store = Restaurant.objects.create(place_id='related-store', name='매장')
        self.menu = Menu.objects.create(preprocess_row_id='related-menu', restaurant=self.store, name='메뉴')
        self.repo = DatabaseCatalogRepository()

    def test_empty_detail_is_one_query_and_missing_id_is_404_data(self):
        with self.assertNumQueries(1):
            detail = self.repo.get_menu(self.menu.pk)
        self.assertEqual(detail['components'], [])
        self.assertEqual(detail['option_groups'], [])
        self.assertEqual(detail['allergen_information']['declarations'], [])
        self.assertIsNone(detail['allergen_information']['brand_reference'])
        with self.assertNumQueries(1):
            self.assertIsNone(self.repo.get_menu('missing'))

    def test_populated_detail_keeps_all_evidence_and_options(self):
        source = CatalogSource.objects.create(title='출처', evidence_locator='자료', source_type='reference')
        link = AllergenLink.objects.create(menu=self.menu, external_menu_id='external', brand='브랜드',
            source=source, payload={'menu_name_raw': '메뉴', 'allergens_contains_normalized': '우유'})
        declaration = FoodDeclaration.objects.create(menu=self.menu, kind='allergen', name_raw='우유',
            canonical_tag='milk', presence='present', source=source, import_link=link)
        group = OptionGroup.objects.create(menu=self.menu, name='소스', source=source)
        component = MenuComponent.objects.create(menu=self.menu, group=group, name='소스', role='sauce', source=source)
        child = FoodDeclaration.objects.create(component=component, kind='ingredient', name_raw='콩', source=source)
        with CaptureQueriesContext(connection) as queries:
            detail = self.repo.get_menu(self.menu.pk)
        self.assertEqual(len(queries), 5)
        self.assertEqual(detail['allergen_information']['brand_reference']['external_menu_id'], 'external')
        self.assertEqual(detail['allergen_information']['declarations'][0]['id'], declaration.pk)
        self.assertEqual(detail['allergen_information']['declarations'][0]['verification_status'], 'unverified')
        self.assertEqual(detail['components'][0]['declarations'][0]['id'], child.pk)
        self.assertEqual(detail['option_groups'][0]['group_id'], group.pk)

    def test_restaurant_empty_and_later_added_hours_and_closures(self):
        with self.assertNumQueries(1):
            detail = self.repo.get_restaurant(self.store.pk)
        self.assertEqual(detail['business_hours'], [])
        self.assertEqual(detail['closures'], [])
        source = CatalogSource.objects.create(title='미확인 영업정보')
        BusinessHours.objects.create(restaurant=self.store, weekday=0, is_closed=True)
        Closure.objects.create(restaurant=self.store, date=date(2026, 11, 24), reason='휴무', source=source)
        with self.assertNumQueries(3):
            detail = self.repo.get_restaurant(self.store.pk)
        self.assertEqual(len(detail['business_hours']), 1)
        self.assertEqual(detail['closures'][0]['reason'], '휴무')
        self.assertEqual(detail['closures'][0]['source']['id'], str(source.pk))
        self.assertEqual(detail['operating_status'], 'unknown')
