from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext

from .models import Menu, MenuAnalysisReference, Restaurant


@override_settings(CATALOG_USE_DB=True)
class MenuDisplayTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        store = Restaurant.objects.create(place_id='display-store', name='Store')
        menu = Menu.objects.create(preprocess_row_id='display-menu', restaurant=store, name='Menu', price_amount=9000)
        MenuAnalysisReference.objects.create(menu=menu, payload={'raw': 'large data' * 1000})

    def test_display_keeps_menu_contract_without_reading_analysis(self):
        full = self.client.get('/api/menus/display-menu').json()
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/menus/display-menu', {'view': 'display'})
        self.assertEqual(response.status_code, 200)
        full['analysis_reference'] = None
        self.assertEqual(response.json(), full)
        self.assertFalse(any('catalog_menuanalysisreference' in q['sql'] for q in queries))

    def test_rejects_unknown_display_mode(self):
        response = self.client.get('/api/menus/display-menu', {'view': 'invalid'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['parameter'], 'view')
