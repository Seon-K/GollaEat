from unittest.mock import Mock

from django.test import SimpleTestCase

from .services import MenuQueryError, haversine_km, list_restaurants


class LocationTests(SimpleTestCase):
    def test_distance_filter_sort_then_paginate(self):
        repo = Mock()
        repo.list_restaurants.return_value = [
            {'restaurant_id': key, 'restaurant_name': key, 'brand': 'A', 'address': 'Asan'}
            for key in ['far', 'unknown', 'near']]
        repo.coordinates.return_value = {'near': (0, 0), 'far': (0, 1)}
        params = {'lat': '0', 'lng': '0', 'sort': 'distance_asc', 'limit': '1', 'brand': 'A'}
        result = list_restaurants(params, repo)
        self.assertEqual(result['results'][0]['restaurant_id'], 'near')
        self.assertEqual(result['pagination']['total'], 3)
        params['radius_km'] = '100'
        result = list_restaurants(params, repo)
        self.assertEqual(result['pagination']['total'], 1)
        self.assertAlmostEqual(haversine_km(0, 0, 0, 1), 111.195, places=3)

    def test_invalid_parameters(self):
        for params in [{'lat': '0'}, {'lat': 'nan', 'lng': '0'},
                       {'lat': '91', 'lng': '0'}, {'lat': '0', 'lng': '181'},
                       {'radius_km': '1'}, {'sort': 'distance_asc'},
                       {'lat': '0', 'lng': '0', 'radius_km': '-1'}]:
            with self.subTest(params=params), self.assertRaises(MenuQueryError):
                list_restaurants(params, Mock())
