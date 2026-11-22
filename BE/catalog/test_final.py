import os
import json
import io
from unittest import skipUnless
from django.test import TestCase, Client, override_settings
from django.core.management import call_command
from .models import Menu, Restaurant, MenuComponent, BusinessHours, FoodDeclaration, AllergenLink, MenuAnalysisReference


@skipUnless(os.getenv('FINAL_TEST_CSV'), 'External final CSV not supplied')
class FinalDataTests(TestCase):
    def test_final_catalog_and_backend_b(self):
        with override_settings(CATALOG_FINAL_CSV=os.environ['FINAL_TEST_CSV'],
                CATALOG_USE_DB=True,
                CATALOG_COORDINATE_VALIDATION_CSV=os.getenv('FINAL_TEST_VALIDATION', '')):
            call_command('import_catalog', verbosity=0)
            self.assertEqual(Restaurant.objects.count(), 356)
            self.assertEqual(Menu.objects.count(), 8436)
            client = Client(enforce_csrf_checks=True)
            menus = client.get('/api/menus', {'limit': 2}).json()
            self.assertEqual(menus['pagination']['total'], 8436)
            mid = menus['results'][0]['menu_id']
            restaurants = client.get('/api/restaurants', {'limit': 1}).json()
            self.assertEqual(restaurants['pagination']['total'], 356)
            rid = restaurants['results'][0]['restaurant_id']
            menu_detail = client.get('/api/menus/' + mid)
            self.assertEqual(menu_detail.status_code, 200)
            self.assertEqual(menu_detail.json()['price'], menus['results'][0]['price'])
            self.assertEqual(menu_detail.json()['restaurant'], menus['results'][0]['restaurant'])
            detail = client.get('/api/restaurants/' + rid).json()
            branch_menus = client.get('/api/restaurants/' + rid + '/menus').json()['results']
            self.assertTrue(branch_menus)
            for item in branch_menus:
                single = client.get('/api/menus/' + item['menu_id']).json()
                self.assertEqual(item['price'], single['price'])
                self.assertEqual(item['restaurant'], single['restaurant'])
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
            base_menu = Menu.objects.get(pk=mid)
            option = MenuComponent.objects.create(menu=base_menu, name='test-only option', role='sauce')
            hours = BusinessHours.objects.create(restaurant_id=rid, weekday=0, is_closed=True)
            declaration = FoodDeclaration.objects.create(menu=base_menu, kind='allergen', name_raw='test-only unknown', canonical_tag='milk')
            preserved = Restaurant.objects.get(pk=rid)
            preserved.latitude, preserved.longitude = 36.7, 127.0
            preserved.save(update_fields=['latitude', 'longitude'])
            call_command('import_catalog', verbosity=0)
            self.assertEqual(Restaurant.objects.count(), 356)
            self.assertEqual(Menu.objects.count(), 8436)
            self.assertTrue(MenuComponent.objects.filter(pk=option.pk).exists())
            self.assertTrue(BusinessHours.objects.filter(pk=hours.pk).exists())
            self.assertTrue(FoodDeclaration.objects.filter(pk=declaration.pk).exists())
            preserved.refresh_from_db()
            self.assertEqual((preserved.latitude, preserved.longitude), (36.7, 127.0))
            self.assertEqual(client.get('/api/favorites').json()['favorites'][0]['menu_id'], mid)
            self.assertTrue(client.get('/api/reviews', {'menu_id': mid}).json()['reviews'])
            with override_settings(CATALOG_FINAL_CSV='missing-file', CATALOG_COORDINATE_VALIDATION_CSV='missing-file'):
                self.assertEqual(client.get('/api/menus/' + mid).status_code, 200)
            if os.getenv('FINAL_TEST_ALLERGENS') and os.getenv('FINAL_TEST_BRANDS'):
                output = io.StringIO()
                call_command('import_catalog_allergens', allergens=os.environ['FINAL_TEST_ALLERGENS'],
                    brand_restaurants=os.environ['FINAL_TEST_BRANDS'], stdout=output)
                stats = json.loads(output.getvalue())
                self.assertEqual(sum(stats.values()), 8436)
                self.assertEqual(AllergenLink.objects.count(), 715)
                self.assertEqual(AllergenLink.objects.filter(status='verified_source').count(), 2)
                for link in AllergenLink.objects.filter(status='verified_source'):
                    self.assertEqual(send('/api/judgements', {'menu_id': link.menu_id})['status'], 'mismatch')
                reference = AllergenLink.objects.filter(status='reference').first()
                self.assertEqual(send('/api/judgements', {'menu_id': reference.menu_id})['status'], 'needs_check')
            if os.getenv('ANALYSIS_TEST_CSV'):
                from dietary.catalog import get_catalog
                snapshots = list(Menu.objects.order_by('pk').values_list('pk', 'restaurant_id', 'name', 'price_amount'))
                protected_ids = [mid, *AllergenLink.objects.filter(status='verified_source').values_list('menu_id', flat=True)]
                before = {key: get_catalog().get_component(key) for key in protected_ids}
                declarations = FoodDeclaration.objects.count()
                call_command('import_menu_analysis', csv=os.environ['ANALYSIS_TEST_CSV'], stdout=io.StringIO())
                call_command('import_menu_analysis', csv=os.environ['ANALYSIS_TEST_CSV'], stdout=io.StringIO())
                self.assertEqual(MenuAnalysisReference.objects.count(), 6034)
                self.assertEqual(Menu.objects.filter(analysis_reference__isnull=True).count(), 2402)
                self.assertEqual(Restaurant.objects.count(), 356)
                self.assertEqual(snapshots, list(Menu.objects.order_by('pk').values_list('pk', 'restaurant_id', 'name', 'price_amount')))
                self.assertEqual(MenuAnalysisReference.objects.filter(ingredient_source='QWEN_TEXT_EXTRACTION').count(), 1948)
                self.assertEqual(MenuAnalysisReference.objects.filter(ingredient_source='GEMINI_ESTIMATED').count(), 463)
                self.assertEqual(MenuAnalysisReference.objects.filter(gemini_status='success').count(), 475)
                self.assertEqual(FoodDeclaration.objects.count(), declarations)
                self.assertEqual(before, {key: get_catalog().get_component(key) for key in protected_ids})
                missing = Menu.objects.filter(analysis_reference__isnull=True).first()
                self.assertIsNone(client.get('/api/menus/' + missing.pk).json()['analysis_reference'])
                with_analysis = MenuAnalysisReference.objects.order_by('menu_id').first().menu_id
                analysis = client.get('/api/menus/' + with_analysis).json()['analysis_reference']
                self.assertIsNotNone(analysis)
                self.assertFalse(analysis['usable_for_dietary_judgement'])
