"""HTTP integration checks; supply CATALOG_MENU_CSV for real-data coverage."""
import json
from unittest import skipUnless

from django.conf import settings
from django.test import Client, TestCase, override_settings

from dietary.catalog import get_catalog
from .repository import MENU_REQUIRED_COLUMNS, _load_csv


@skipUnless(settings.CATALOG_MENU_CSV, 'Set CATALOG_MENU_CSV for real CSV integration')
@override_settings(CATALOG_USE_DB=False)
class RealCsvIntegrationTests(TestCase):
    def test_session_csrf_and_backend_b_endpoints(self):
        rows = _load_csv(settings.CATALOG_MENU_CSV, MENU_REQUIRED_COLUMNS, 'menu')
        row = next(r for r in rows if r['verification_status'] == 'auto_extracted_pending_review')
        client = Client(enforce_csrf_checks=True)
        detail = client.get('/api/menus/' + row['menu_id'])
        self.assertEqual(detail.status_code, 200)
        mid = detail.json()['menu_id']
        listing = client.get('/api/menus', {'q': row['menu_name_raw'], 'limit': 100})
        self.assertEqual(listing.status_code, 200)
        self.assertTrue(any(item['menu_id'] == mid for item in listing.json()['results']))
        priced = client.get('/api/menus', {'min_price': 1, 'sort': 'price_asc'})
        self.assertEqual(priced.status_code, 200)
        self.assertTrue(all(item['price']['amount'] is not None for item in priced.json()['results']))
        component = get_catalog().get_component(mid)
        self.assertIsNotNone(component)
        self.assertEqual(component['present_tags'], [])
        self.assertEqual(component['absent_tags'], [])
        self.assertEqual(client.post('/api/judgements', json.dumps({'menu_id': mid}),
                                    content_type='application/json').status_code, 403)
        token = client.get('/api/session').json()['csrf_token']

        def send(method, path, body, expected=200):
            response = getattr(client, method)(path, json.dumps(body),
                content_type='application/json', HTTP_X_CSRFTOKEN=token)
            self.assertEqual(response.status_code, expected, response.content)
            return response.json()

        send('put', '/api/profile', {'criteria': ['allergen-milk']})
        for menu_id in [mid, 'nonexistent-integration-menu']:
            result = send('post', '/api/judgements', {'menu_id': menu_id})
            self.assertEqual(result['status'], 'needs_check')
        ranked = send('post', '/api/recommendations/rank', {'menu_ids': [mid, 'nonexistent-integration-menu']})
        self.assertTrue(all(r['status'] == 'needs_check' for r in ranked['results']))
        order = send('post', '/api/orders/check', {'components': [{'id': mid, 'role': 'menu'}]})
        self.assertEqual(order['status'], 'needs_check')
        favorite = send('post', '/api/favorites', {'menu_id': mid}, 201)
        self.assertEqual(client.get('/api/favorites').json()['favorites'][0]['judgement']['status'], 'needs_check')
        review = send('post', '/api/reviews', {'menu_id': mid, 'body': 'integration test',
                                            'disclose_conditions': ['allergen-milk']}, 201)
        self.assertEqual(client.get('/api/reviews', {'menu_id': mid}).json()['reviews'][0]['menu_id'], mid)
        other = Client(enforce_csrf_checks=True)
        other_token = other.get('/api/session').json()['csrf_token']
        self.assertEqual(other.get('/api/favorites').json()['favorites'], [])
        self.assertEqual(other.delete('/api/favorites/' + str(favorite['id']), HTTP_X_CSRFTOKEN=other_token).status_code, 404)
        self.assertEqual(other.patch('/api/reviews/' + str(review['id']), json.dumps({'body': 'changed'}),
            content_type='application/json', HTTP_X_CSRFTOKEN=other_token).status_code, 404)
        send('patch', '/api/reviews/' + str(review['id']), {'body': 'updated'})
        send('delete', '/api/reviews/' + str(review['id']), {})
        send('delete', '/api/favorites/' + str(favorite['id']), {})
