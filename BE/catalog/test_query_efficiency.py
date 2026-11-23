"""Search compatibility and bounded full-payload reads; isolated test DB only."""
from unittest.mock import patch

from django.db import connection
from django.http import QueryDict
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext

from .db_repository import DatabaseCatalogRepository
from .models import Menu, Restaurant
from .services import list_menus, list_restaurants


class LegacyReadRepository:
    """Run the original service path against the same rows for comparison."""
    def __init__(self):
        self.repository = DatabaseCatalogRepository()

    def list_menus(self):
        return self.repository.list_menus()

    def list_restaurants(self):
        rows = Restaurant.objects.select_related('hours_source').prefetch_related('business_hours', 'closures__source')
        return [self.repository._restaurant(row) for row in rows.order_by('place_id')]

    def coordinates(self):
        return {r['restaurant_id']: (r['latitude'], r['longitude']) for r in self.list_restaurants()
                if r['latitude'] is not None and r['longitude'] is not None}


@override_settings(CATALOG_USE_DB=True)
class MenuQueryEfficiencyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        near = Restaurant.objects.create(place_id='near', name='가까운 식당', brand='TEST',
            address='아산 배방', category='한식', latitude=36.78, longitude=127.05)
        unknown = Restaurant.objects.create(place_id='unknown', name='좌표 없는 식당', address='서울')
        Menu.objects.bulk_create([Menu(preprocess_row_id=f'm-{i:03}', restaurant=near if i % 2 else unknown,
            name=f'김밥 {i:03}' if i % 3 else f'ß 메뉴 {i:03}',
            category='중식' if i % 4 else '', price_amount=i * 100 if i % 5 else None,
            data={'restaurant_search_names': ['옛 매장 이름'], 'description_raw': '원문' * 1000,
                  'price_raw': '가격 문의', 'menu_option': '소스 별도', 'collected_at': '2026-11-01'})
            for i in range(60)])

    def test_search_filter_sort_pagination_match_original(self):
        cases = ['', 'q=김밥', 'q=옛+매장', 'q=ss', 'q=TEST', 'q=없는메뉴',
            'category=한식&category=중식', 'min_price=0', 'max_price=1200',
            'sort=price_asc&limit=3&page=2', 'sort=price_desc&limit=7',
            'page=999', 'region=아산', 'open_now=true', 'open_now=false',
            'lat=36.78&lng=127.05&limit=4',
            'lat=36.78&lng=127.05&radius_km=1&sort=distance_asc&limit=3&page=2']
        for raw in cases:
            with self.subTest(query=raw):
                params = QueryDict(raw)
                expected = list_menus(params, LegacyReadRepository())
                self.assertEqual(list_menus(params, DatabaseCatalogRepository()), expected)

    def test_only_page_menus_are_fully_loaded_and_hours_not_loaded_for_location(self):
        repo = DatabaseCatalogRepository()
        original = repo._menu
        with patch.object(repo, '_menu', wraps=original) as serialize, CaptureQueriesContext(connection) as queries:
            result = list_menus(QueryDict('lat=36.78&lng=127.05&limit=4'), repo)
        self.assertEqual(serialize.call_count, 4)
        self.assertEqual(result['pagination']['total'], 60)
        self.assertEqual(len(queries), 2)
        sql = queries[0]['sql']
        self.assertNotRegex(sql, r'(?:SELECT |, )"catalog_menu"\."data"(?:,| AS | FROM )')
        self.assertFalse(any('catalog_businesshours' in q['sql'] for q in queries))
        self.assertEqual(result['results'][0]['menu_option'], '소스 별도')

    def test_empty_page_does_not_load_full_payloads(self):
        repo = DatabaseCatalogRepository()
        with patch.object(repo, '_menu', wraps=repo._menu) as serialize, self.assertNumQueries(1):
            result = list_menus(QueryDict('q=없는메뉴'), repo)
        self.assertEqual(result['results'], [])
        serialize.assert_not_called()

    def test_personalization_and_favorite_use_same_menu_id(self):
        client = self.client
        token = client.get('/api/session').json()['csrf_token']
        result = client.get('/api/menus', {'q': '김밥', 'limit': 1, 'personalize': 'true'}).json()
        menu = result['results'][0]
        mid = menu['menu_id']
        response = client.post('/api/favorites', {'menu_id': mid}, content_type='application/json',
            HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201)
        result = client.get('/api/menus', {'q': menu['menu_name'], 'personalize': 'true'}).json()
        self.assertTrue(result['results'][0]['saved'])
        self.assertEqual(result['results'][0]['judgement']['component_id'], mid)
        favorite_id = response.json()['id']
        self.assertEqual(client.delete(f'/api/favorites/{favorite_id}', HTTP_X_CSRFTOKEN=token).status_code, 200)
        self.assertFalse(client.get('/api/menus', {'q': menu['menu_name'], 'personalize': 'true'}).json()['results'][0]['saved'])

    def test_coordinates_do_not_serialize_hours_or_restaurants(self):
        repo = DatabaseCatalogRepository()
        with patch.object(repo, '_restaurant', side_effect=AssertionError('unneeded full restaurant read')):
            with self.assertNumQueries(1):
                self.assertEqual(repo.coordinates(), {'near': (36.78, 127.05)})

    def test_database_order_limit_offset_and_null_prices(self):
        for sort in ['price_asc', 'price_desc']:
            with self.subTest(sort=sort), CaptureQueriesContext(connection) as queries:
                params = QueryDict(f'sort={sort}&limit=3&page=2')
                actual = list_menus(params, DatabaseCatalogRepository())
            self.assertEqual(actual, list_menus(params, LegacyReadRepository()))
            self.assertIn('LIMIT 3 OFFSET 3', queries[-1]['sql'])
            self.assertIn('ORDER BY', queries[-1]['sql'])
        Menu.objects.filter(name__startswith='ß').update(name='ASCII MENU')
        with CaptureQueriesContext(connection) as queries:
            result = list_menus(QueryDict('limit=2&page=2'), DatabaseCatalogRepository())
        self.assertIn('LIMIT 2 OFFSET 2', queries[-1]['sql'])
        self.assertEqual(result, list_menus(QueryDict('limit=2&page=2'), LegacyReadRepository()))

    def test_sql_search_does_not_drop_unicode_alias_or_literal_wildcards(self):
        store = Restaurant.objects.get(pk='near')
        Menu.objects.create(preprocess_row_id='special', restaurant=store, name='K 100%_식사',
                            category='Straße', data={})
        Menu.objects.create(preprocess_row_id='unrelated', restaurant=store, name='엉뚱한 메뉴', data={})
        for raw in ['q=K', 'q=100%25_', 'category=strasse', 'q=ss', 'q=옛+매장']:
            with self.subTest(query=raw):
                self.assertEqual(list_menus(QueryDict(raw), DatabaseCatalogRepository()),
                                 list_menus(QueryDict(raw), LegacyReadRepository()))
        repo = DatabaseCatalogRepository()
        self.assertNotIn('unrelated', {m['menu_id'] for m in repo.menu_candidates(query='100%_')})

    def test_nul_input_is_not_sent_as_postgresql_text_parameter(self):
        def reject_nul(execute, sql, params, many, context):
            self.assertFalse(any(isinstance(value, str) and '\x00' in value for value in params or []))
            return execute(sql, params, many, context)
        for raw in ['q=%00', 'region=%00', 'category=%00']:
            with self.subTest(query=raw), connection.execute_wrapper(reject_nul):
                self.assertEqual(list_menus(QueryDict(raw), DatabaseCatalogRepository()),
                                 list_menus(QueryDict(raw), LegacyReadRepository()))

    def test_restaurant_results_and_price_aggregation_match_original(self):
        for raw in ['', 'q=가까운', 'brand=TEST', 'region=아산', 'category=한식',
                    'open_now=true', 'open_now=false', 'min_price=300&max_price=1000',
                    'sort=price_asc&limit=1', 'sort=price_desc&limit=1&page=2',
                    'lat=36.78&lng=127.05&radius_km=1&sort=distance_asc&limit=1', 'page=99']:
            with self.subTest(query=raw):
                self.assertEqual(list_restaurants(QueryDict(raw), DatabaseCatalogRepository()),
                                 list_restaurants(QueryDict(raw), LegacyReadRepository()))

    def test_restaurant_location_reads_hours_only_for_selected_page(self):
        repo = DatabaseCatalogRepository()
        with patch.object(repo, '_restaurant', wraps=repo._restaurant) as serialize, CaptureQueriesContext(connection) as queries:
            result = list_restaurants(QueryDict('lat=36.78&lng=127.05&sort=distance_asc&limit=1'), repo)
        self.assertEqual(result['results'][0]['restaurant_id'], 'near')
        self.assertEqual(serialize.call_count, 1)
        self.assertEqual(len(queries), 2)
        self.assertFalse(any(q['sql'].startswith('SELECT "catalog_businesshours".') for q in queries))


@override_settings(CATALOG_USE_DB=True)
class LocalPerformanceComparisonTests(TestCase):
    """Representative sizes, synthetic rows; never accesses the shared database."""
    @classmethod
    def setUpTestData(cls):
        Restaurant.objects.bulk_create([Restaurant(place_id=f'r-{i:03}', name=f'로컬 식당 {i:03}',
            address='아산시 배방읍', latitude=36.78 + i / 10000, longitude=127.05) for i in range(356)])
        Menu.objects.bulk_create([Menu(preprocess_row_id=f'menus_{i:06}', restaurant_id=f'r-{i % 356:03}',
            name=f'{"김밥" if i % 10 == 0 else "메뉴"} {i:06}', price_amount=(i % 35 + 1) * 1000,
            data={'description_raw': '원문' * 600, 'menu_option': '옵션 미확인', 'price_raw': '원문 가격'})
            for i in range(8436)], batch_size=200)

    def test_same_dataset_before_after(self):
        import json
        import time
        scenarios = [
            ('menus40_location', list_menus, 'limit=40&lat=36.78&lng=127.05'),
            ('search40_location', list_menus, 'q=김밥&limit=40&lat=36.78&lng=127.05'),
            ('restaurants5_distance', list_restaurants,
             'limit=5&lat=36.78&lng=127.05&radius_km=3&sort=distance_asc')]
        measurements = []
        for label, function, query in scenarios:
            results = []
            row = {'scenario': label}
            for version, repository in [('before', LegacyReadRepository()), ('after', DatabaseCatalogRepository())]:
                started = time.perf_counter()
                with CaptureQueriesContext(connection) as queries:
                    result = function(QueryDict(query), repository)
                    json.dumps(result, default=str)
                results.append(result)
                row[version] = {'queries': len(queries), 'ms': round((time.perf_counter() - started) * 1000, 2)}
            self.assertEqual(results[0], results[1])
            self.assertLess(row['after']['queries'], row['before']['queries'])
            measurements.append(row)
        print('LOCAL_SYNTHETIC_SQLITE_BENCHMARK ' + json.dumps(measurements))
