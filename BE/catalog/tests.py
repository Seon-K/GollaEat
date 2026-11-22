import csv
import os
import tempfile
from unittest.mock import patch
from .repository import MockMenuRepository

from django.test import SimpleTestCase
from django.test.utils import override_settings


class MenuListApiTests(SimpleTestCase):
    def setUp(self):
        mocked = patch('catalog.views._csv_repository', return_value=MockMenuRepository())
        mocked.start()
        self.addCleanup(mocked.stop)
    def test_lists_menus_with_default_pagination(self):
        response = self.client.get('/api/menus')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['pagination']['total'], 5)
        self.assertEqual(payload['pagination']['count'], 5)
        self.assertEqual(len(payload['results']), 5)
        self.assertIn('restaurant', payload['results'][0])
        self.assertIn('price', payload['results'][0])

    def test_searches_menu_and_restaurant_names(self):
        menu_response = self.client.get('/api/menus', {'q': '두부'})
        restaurant_response = self.client.get('/api/menus', {'q': '갓잇'})

        self.assertEqual(
            [item['menu_id'] for item in menu_response.json()['results']],
            ['menu-003', 'menu-004'],
        )
        self.assertEqual(
            {item['menu_id'] for item in restaurant_response.json()['results']},
            {'menu-001', 'menu-002'},
        )

    def test_filters_price_and_category_and_sorts(self):
        response = self.client.get(
            '/api/menus',
            {'min_price': '10000', 'max_price': '50000', 'category': '멕시코', 'sort': 'price_desc'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['menu_id'] for item in response.json()['results']], ['menu-002'])

        sorted_response = self.client.get('/api/menus', {'sort': 'price_asc', 'limit': '2'})
        self.assertEqual(
            [item['price']['amount'] for item in sorted_response.json()['results']],
            [9000, 12000],
        )
        self.assertEqual(sorted_response.json()['pagination']['next_page'], 2)

    def test_returns_empty_results_for_no_matches(self):
        response = self.client.get('/api/menus', {'q': '존재하지않는메뉴'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['results'], [])
        self.assertEqual(response.json()['pagination']['total'], 0)

    def test_rejects_invalid_parameters(self):
        invalid_cases = [
            ({'min_price': 'cheap'}, 'min_price'),
            ({'min_price': '20000', 'max_price': '10000'}, 'min_price'),
            ({'sort': 'distance'}, 'sort'),
            ({'page': '0'}, 'page'),
            ({'limit': '101'}, 'limit'),
            ({'unexpected': 'value'}, 'unexpected'),
        ]

        for params, expected_parameter in invalid_cases:
            with self.subTest(params=params):
                response = self.client.get('/api/menus', params)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['error']['parameter'], expected_parameter)

    def test_rejects_non_get_methods(self):
        response = self.client.post('/api/menus')

        self.assertEqual(response.status_code, 405)
        self.assertEqual(response['Allow'], 'GET')


@override_settings(CATALOG_USE_DB=False)
class RestaurantCsvApiTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.menu_path = os.path.join(self.directory.name, 'menus.csv')
        self.restaurant_path = os.path.join(self.directory.name, 'restaurants.csv')
        self._write_csv(
            self.menu_path,
            [
                {
                    'brand': '테스트 브랜드',
                    'menu_name_raw': '참고 메뉴 A',
                    'menu_id': 'source-menu-1',
                    'clean_id': 'clean-menu-1',
                    'category': '한식',
                    'allergen_status': 'listed',
                    'verification_status': 'manual_visual_checked',
                },
                {
                    'brand': '테스트브랜드',
                    'menu_name_raw': '참고 메뉴 B',
                    'menu_id': 'source-menu-2',
                    'clean_id': 'clean-menu-2',
                    'category': '한식',
                    'allergen_status': 'unknown',
                    'verification_status': 'auto_extracted_pending_review',
                },
                {
                    'brand': '다른브랜드',
                    'menu_name_raw': '연결되지 않는 메뉴',
                    'menu_id': 'source-menu-3',
                    'clean_id': 'clean-menu-3',
                    'category': '양식',
                    'allergen_status': 'listed',
                    'verification_status': 'manual_visual_checked',
                },
            ],
        )
        self._write_csv(
            self.restaurant_path,
            [
                {
                    '브랜드': '테스트브랜드',
                    'place_id': '1001',
                    '식당 이름(지점명)': '테스트브랜드 아산점',
                    '주소': '충남 아산시 테스트로 1',
                    '전화번호': '041-000-0001',
                    '네이버지도 URL': 'https://map.example/1001',
                    '수집일시': '2026-11-18T00:00:00Z',
                },
                {
                    '브랜드': '다른브랜드',
                    'place_id': '1002',
                    '식당 이름(지점명)': '다른브랜드 배방점',
                    '주소': '충남 아산시 배방읍 테스트로 2',
                    '전화번호': '',
                    '네이버지도 URL': 'https://map.example/1002',
                    '수집일시': '2026-11-18T00:00:00Z',
                },
            ],
        )
        settings_override = override_settings(
            CATALOG_MENU_CSV=self.menu_path,
            CATALOG_RESTAURANT_CSV=self.restaurant_path,
        )
        settings_override.enable()
        self.addCleanup(settings_override.disable)

    @staticmethod
    def _write_csv(path, rows):
        with open(path, 'w', encoding='utf-8-sig', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

    def test_lists_and_searches_restaurants_from_csv(self):
        response = self.client.get('/api/restaurants', {'q': '배방', 'limit': '10'})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['pagination']['total'], 1)
        self.assertEqual(payload['results'][0]['restaurant_id'], '1002')
        self.assertIsNone(payload['results'][0]['phone'])

        brand_response = self.client.get('/api/restaurants', {'brand': '테스트 브랜드'})
        self.assertEqual(
            [item['restaurant_id'] for item in brand_response.json()['results']],
            ['1001'],
        )

    def test_detail_links_brand_menus_without_claiming_branch_sales(self):
        response = self.client.get('/api/restaurants/1001')

        self.assertEqual(response.status_code, 200)
        reference = response.json()['brand_menu_reference']
        self.assertEqual(reference['match_method'], 'normalized_brand_exact')
        self.assertEqual(reference['scope'], 'brand_reference_only')
        self.assertEqual(reference['branch_sale_status'], 'unverified')
        self.assertEqual(reference['count'], 2)
        self.assertTrue(
            all(menu['branch_sale_status'] == 'unverified' for menu in reference['menus'])
        )

    def test_restaurant_errors(self):
        self.assertEqual(self.client.get('/api/restaurants/missing').status_code, 404)
        invalid = self.client.get('/api/restaurants', {'limit': '0'})
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.json()['error']['parameter'], 'limit')
        self.assertEqual(self.client.post('/api/restaurants').status_code, 405)

    def test_brand_menu_search_pagination_and_adapter_ids(self):
        from dietary.catalog import get_catalog
        response = self.client.get('/api/restaurants/1001/menus', {'limit': 1})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['pagination']['total'], 2)
        self.assertEqual(data['pagination']['next_page'], 2)
        menu = data['results'][0]
        self.assertEqual(menu['branch_sale_status'], 'unverified')
        self.assertIsNotNone(get_catalog().get_component(menu['menu_id']))
        second = self.client.get('/api/restaurants/1001/menus', {'page': 2, 'limit': 1}).json()
        self.assertNotEqual(menu['menu_id'], second['results'][0]['menu_id'])
        search = self.client.get('/api/restaurants/1001/menus', {'q': 'B'}).json()
        self.assertEqual(search['results'][0]['menu_id'], 'source-menu-2')
        self.assertEqual(search['pagination']['total'], 1)
        self.assertEqual(self.client.get('/api/restaurants/1001/menus', {'q': 'missing'}).json()['results'], [])
        self.assertEqual(self.client.get('/api/restaurants/missing/menus').status_code, 404)
        self.assertEqual(self.client.get('/api/restaurants/1001/menus', {'limit': 0}).status_code, 400)
        self.assertEqual(self.client.post('/api/restaurants/1001/menus').status_code, 405)

    def test_returns_503_when_csv_paths_are_not_configured(self):
        with override_settings(CATALOG_MENU_CSV='', CATALOG_RESTAURANT_CSV=''):
            response = self.client.get('/api/restaurants')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['error']['code'], 'catalog_unavailable')

