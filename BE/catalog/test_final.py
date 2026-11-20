import os
import json
from unittest import skipUnless
from django.test import TestCase, Client, override_settings


@skipUnless(os.getenv('FINAL_TEST_CSV'), 'External final CSV not supplied')
class FinalDataTests(TestCase):
    def test_final_catalog_and_backend_b(self):
        with override_settings(CATALOG_FINAL_CSV=os.environ['FINAL_TEST_CSV'],
                CATALOG_COORDINATE_VALIDATION_CSV=os.getenv('FINAL_TEST_VALIDATION', '')):
            client = Client(enforce_csrf_checks=True)
            menus = client.get('/api/menus', {'limit': 2}).json()
            self.assertEqual(menus['pagination']['total'], 8436)
            mid = menus['results'][0]['menu_id']
            restaurants = client.get('/api/restaurants', {'limit': 1}).json()
            self.assertEqual(restaurants['pagination']['total'], 356)
            rid = restaurants['results'][0]['restaurant_id']
            self.assertEqual(client.get('/api/menus/' + mid).status_code, 200)
            detail = client.get('/api/restaurants/' + rid).json()
            self.assertIn('coordinate_validation_status', detail)
            self.assertEqual(client.get('/api/restaurants/' + rid + '/menus').status_code, 200)
            self.assertTrue(client.get('/api/menus', {'q': menus['results'][0]['menu_name']}).json()['results'])
            prices = client.get('/api/menus', {'min_price': 1, 'max_price': 20000, 'sort': 'price_desc'}).json()['results']
            amounts = [m['price']['amount'] for m in prices]
            self.assertEqual(amounts, sorted(amounts, reverse=True))
            nearby = client.get('/api/restaurants', {'lat': 36.78, 'lng': 127.05,
                'radius_km': 2, 'sort': 'distance_asc'}).json()['results']
            distances = [r['distance_km'] for r in nearby]
            self.assertTrue(distances)
            self.assertEqual(distances, sorted(distances))
            self.assertTrue(all(d <= 2 for d in distances))
            token = client.get('/api/session').json()['csrf_token']
            def send(path, body, method='post'):
                response = getattr(client, method)(path, json.dumps(body), content_type='application/json', HTTP_X_CSRFTOKEN=token)
                self.assertIn(response.status_code, [200, 201], response.content)
                return response.json()
            send('/api/profile', {'criteria': ['allergen-milk']}, 'put')
            self.assertEqual(send('/api/judgements', {'menu_id': mid})['status'], 'needs_check')
            self.assertEqual(send('/api/judgements', {'menu_id': 'missing'})['status'], 'needs_check')
            self.assertEqual(send('/api/recommendations/rank', {'menu_ids': [mid]})['results'][0]['status'], 'needs_check')
            self.assertEqual(send('/api/orders/check', {'components': [{'id': mid, 'role': 'menu'}]})['status'], 'needs_check')
            send('/api/favorites', {'menu_id': mid})
            send('/api/reviews', {'menu_id': mid, 'body': 'test'})
