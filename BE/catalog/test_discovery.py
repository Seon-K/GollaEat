import uuid
from unittest.mock import patch
from django.test import TestCase, override_settings
from dietary.models import Profile, Criterion
from .db_repository import DatabaseCatalogRepository
from .models import Restaurant, Menu
from .discovery import discover_restaurants, parse_area
from .services import MenuQueryError


@override_settings(CATALOG_USE_DB=True)
class DiscoveryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.profile = Profile.objects.create(guest_id=uuid.uuid4())
        cls.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        cls.empty_profile = Profile.objects.create(guest_id=uuid.uuid4())
        near = Restaurant.objects.create(place_id='near', name='Near', category='카페', latitude=36, longitude=127)
        far = Restaurant.objects.create(place_id='far', name='Far', latitude=36.01, longitude=127)
        unknown = Restaurant.objects.create(place_id='unknown', name='Unknown')
        Restaurant.objects.create(place_id='empty', name='Empty', latitude=36, longitude=127)
        for rid, name, category, price in [('a', near, '한식', 9000), ('b', near, '중식', 5000), ('c', far, '한식', 7000), ('d', unknown, '한식', 3000)]:
            Menu.objects.create(preprocess_row_id=rid, restaurant=name, name=rid, category=category, price_amount=price)

    def query(self, **extra):
        params = dict(personalize='true', lat='36', lng='127', radius_km='3', sort='dietary')
        params.update(extra)
        return discover_restaurants(params, DatabaseCatalogRepository(), self.profile)

    def test_validation(self):
        for params in [dict(bounds='127,36,128,37', radius_km='1', lat='36', lng='127'),
                       dict(bounds='nan,36,128,37'), dict(bounds='128,36,127,37'),
                       dict(bounds='127,36,130,37'), dict(bounds='127,36,128'),
                       dict(lat='36'), dict(lat='36', lng='inf'),
                       dict(lat='36', lng='127', radius_km='101')]:
            with self.subTest(params=params), self.assertRaises(MenuQueryError):
                parse_area(params)
        for extra in [dict(personalize='false', match_only='true'), dict(match_only='yes'), dict(unknown='x')]:
            with self.subTest(extra=extra), self.assertRaises(MenuQueryError):
                self.query(**extra)

    @patch('dietary.services.evaluate')
    @patch('dietary.services.EvaluationContext.prime')
    def test_filter_aggregate_then_paginate(self, prime, evaluate):
        evaluate.side_effect = lambda profile, mid, context: {'status': {'a': 'needs_check', 'b': 'mismatch', 'c': 'match'}[mid]}
        result = self.query(category='한식', match_only='true', limit='1')
        self.assertEqual(result['pagination']['total'], 1)
        row = result['results'][0]
        self.assertEqual(row['restaurant_id'], 'far')
        self.assertEqual(row['representative_menu']['menu_id'], 'c')
        self.assertEqual(row['representative_menu']['branch_sale_status'], 'unverified')
        self.assertEqual(row['dietary_summary'], dict(match_menu_count=1, check_menu_count=0, mismatch_menu_count=0))
        self.assertEqual(set(prime.call_args.args[0]), {'a', 'c'})
        self.assertEqual(self.query(category='한식', match_only='true', page='2', limit='1')['results'], [])
        self.assertEqual(self.query(category='한식', max_price='6000', match_only='true')['pagination']['total'], 0)

    def test_unconfigured_not_match_and_unknown_coordinates_excluded(self):
        params = dict(personalize='true', lat='36', lng='127', radius_km='3')
        result = discover_restaurants(params, DatabaseCatalogRepository(), self.empty_profile)
        self.assertEqual({r['restaurant_id'] for r in result['results']}, {'near', 'far', 'empty'})
        self.assertTrue(all(not r['personalization']['applied'] for r in result['results']))
        self.assertTrue(all(r['dietary_summary']['match_menu_count'] == 0 for r in result['results']))
        self.assertEqual(discover_restaurants(dict(params, match_only='true'), DatabaseCatalogRepository(), self.empty_profile)['results'], [])

    def test_bounds_inclusive_and_distance_origin_independent(self):
        result = discover_restaurants(dict(bounds='127,36,127.1,36.01', lat='35', lng='127'), DatabaseCatalogRepository())
        self.assertEqual({r['restaurant_id'] for r in result['results']}, {'near', 'far', 'empty'})
        self.assertTrue(all(r['distance_km'] > 100 for r in result['results']))

    @patch('dietary.services.evaluate', return_value={'status': 'needs_check', 'sort_key': [1, 0, 'a']})
    @patch('dietary.services.EvaluationContext.prime')
    def test_asan_region_limits_candidates_before_evaluation(self, prime, evaluate):
        Restaurant.objects.filter(pk='near').update(address='충남 아산시 배방읍')
        Restaurant.objects.filter(pk='far').update(address='충남 천안시 동남구')
        result = self.query(region='아산시')
        self.assertEqual([r['restaurant_id'] for r in result['results']], ['near'])
        self.assertEqual(set(prime.call_args.args[0]), {'a', 'b'})
        from .services import list_menus
        menus = list_menus({'region': '아산시', 'sort': 'dietary'}, DatabaseCatalogRepository(), profile=self.profile)
        self.assertEqual(menus['pagination']['total'], 2)

    def test_real_engine_and_sessions_via_http(self):
        response = self.client.get('/api/restaurants', {'personalize': 'true', 'bounds': '126.9,35.9,127.1,36.1'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['results'][0]['personalization']['applied'])
        self.client.put('/api/profile', data='{"criteria":["allergen-milk"]}', content_type='application/json')
        response = self.client.get('/api/restaurants', {'personalize': 'true', 'bounds': '126.9,35.9,127.1,36.1'})
        self.assertTrue(response.json()['results'][0]['personalization']['applied'])
        # Menus without ingredient evidence are never a match.
        self.assertTrue(all(r['dietary_summary']['match_menu_count'] == 0 for r in response.json()['results']))
        from django.test import Client
        other = Client().get('/api/restaurants', {'personalize': 'true', 'match_only': 'true'})
        self.assertEqual(other.json()['results'], [])
        self.assertEqual(self.client.get('/api/restaurants', {'bounds': 'bad'}).status_code, 400)

    def test_candidate_queries_constant_as_menu_count_grows(self):
        repo = DatabaseCatalogRepository()
        params = dict(personalize='true', bounds='126.9,35.9,127.1,36.1', limit='1')
        with self.assertNumQueries(4):
            discover_restaurants(params, repo, self.empty_profile)
        store = Restaurant.objects.get(pk='near')
        Menu.objects.bulk_create([Menu(preprocess_row_id=f'extra-{i}', restaurant=store, name='extra') for i in range(100)])
        with self.assertNumQueries(4):
            discover_restaurants(params, repo, self.empty_profile)

    def test_personalized_query_count_is_bounded(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        params = dict(personalize='true', bounds='126.9,35.9,127.1,36.1', sort='dietary')
        repo = DatabaseCatalogRepository()
        with CaptureQueriesContext(connection) as before:
            discover_restaurants(params, repo, self.profile)
        store = Restaurant.objects.get(pk='near')
        Menu.objects.bulk_create([Menu(preprocess_row_id=f'batch-{i}', restaurant=store, name='extra') for i in range(100)])
        with CaptureQueriesContext(connection) as after:
            result = discover_restaurants(params, repo, self.profile)
        self.assertEqual(len(before), len(after))
        self.assertLess(len(after), 15)
        self.assertTrue(all(r['dietary_summary']['match_menu_count'] == 0 for r in result['results']))

    def test_session_cache_marker_is_stable_and_distinct(self):
        from django.test import Client
        first = self.client.get('/api/session')
        marker = first.json()['cache_identity']
        self.assertEqual(first['X-GollaEat-Session'], marker)
        self.assertEqual(self.client.get('/api/profile')['X-GollaEat-Session'], marker)
        self.assertNotEqual(Client().get('/api/session').json()['cache_identity'], marker)
        self.assertEqual(first['Cache-Control'], 'private, no-store')

    def test_restaurant_menu_filter_before_sort_and_pagination(self):
        from .services import list_menus
        repo = DatabaseCatalogRepository()
        for sort in ['menu_name_asc', 'price_asc', 'price_desc', 'dietary']:
            with self.subTest(sort=sort), patch.object(repo, 'initial_menu_page', side_effect=AssertionError('must scope before paging')):
                result = list_menus(dict(restaurant_id='near', sort=sort, limit='1'), repo, profile=self.profile)
            self.assertEqual(result['pagination']['total'], 2)
            self.assertTrue(all(m['restaurant']['restaurant_id'] == 'near' for m in result['results']))
        result = list_menus(dict(restaurant_id='near', category='한식', max_price='6000'), repo)
        self.assertEqual(result['results'], [])
        self.assertEqual(list_menus(dict(restaurant_id='missing'), repo)['results'], [])
        response = self.client.get('/api/menus', {'restaurant_id': 'near', 'personalize': 'true', 'limit': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['pagination']['total'], 2)
        self.assertIn('judgement', response.json()['results'][0])

    def test_home_twenty_item_pagination_contract(self):
        store = Restaurant.objects.create(place_id='pages', name='아산 페이지 테스트', address='충남 아산시')
        Menu.objects.bulk_create([Menu(preprocess_row_id=f'page-{i:03}', restaurant=store, name=f'메뉴 {i:03}', price_amount=i)
                                  for i in range(45)])
        seen = set()
        for page, count in [(1, 20), (2, 20), (3, 5)]:
            response = self.client.get('/api/menus', {'restaurant_id': 'pages', 'region': '아산시', 'limit': 20, 'page': page, 'sort': 'price_asc'})
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(len(result['results']), count)
            self.assertEqual(result['pagination']['total'], 45)
            self.assertEqual(result['pagination']['total_pages'], 3)
            ids = {m['menu_id'] for m in result['results']}
            self.assertFalse(seen & ids)
            seen |= ids
        self.assertEqual(len(seen), 45)

    @patch('dietary.services.evaluate')
    @patch('dietary.services.EvaluationContext.prime')
    def test_verdict_filters_before_restaurant_and_menu_pagination(self, prime, evaluate):
        from .services import list_menus
        statuses = {'a': 'needs_check', 'b': 'mismatch', 'c': 'match', 'd': 'needs_check'}
        evaluate.side_effect = lambda profile, mid, context: {'status': statuses[mid], 'sort_key': [0, 0, mid]}
        for status, rid, mid in [('match', 'far', 'c'), ('needs_check', 'near', 'a'), ('mismatch', 'near', 'b')]:
            with self.subTest(status=status):
                result = self.query(judgement_status=status, sort='price_asc', limit='1')
                self.assertEqual(result['pagination']['total'], 1)
                self.assertEqual(result['results'][0]['restaurant_id'], rid)
                self.assertEqual(result['results'][0]['representative_menu']['menu_id'], mid)
                menus = list_menus(dict(judgement_status=status, sort='price_asc', page='1', limit='1'), DatabaseCatalogRepository(), profile=self.profile)
                self.assertEqual(menus['results'][0]['judgement']['status'], status)
                expected = sum(s == status for s in statuses.values())
                self.assertEqual(menus['pagination']['total'], expected)
                self.assertEqual(list_menus(dict(judgement_status=status, page=str(expected + 1), limit='1'), DatabaseCatalogRepository(), profile=self.profile)['results'], [])
        with self.assertRaises(MenuQueryError):
            self.query(judgement_status='bad')
        with self.assertRaises(MenuQueryError):
            self.query(judgement_status='mismatch', match_only='true')
