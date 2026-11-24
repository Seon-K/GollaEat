import uuid
from datetime import timedelta
from unittest.mock import patch
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from dietary.models import Profile, Criterion
from .models import Restaurant, Menu, FoodDeclaration, CatalogSource, MenuDietaryState
from .db_repository import DatabaseCatalogRepository
from .dietary_index import available, rebuild, next_boundaries
from .services import list_menus
from .discovery import discover_restaurants


@override_settings(CATALOG_USE_DB=True, CATALOG_DIETARY_INDEX_ENABLED=True)
class DietaryIndexTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.profile = Profile.objects.create(guest_id=uuid.uuid4())
        cls.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        cls.empty = Profile.objects.create(guest_id=uuid.uuid4())
        cls.store = Restaurant.objects.create(place_id='s', name='Store', address='Asan', latitude=36, longitude=127)
        cls.source = CatalogSource.objects.create(title='Verified', evidence_locator='record', source_type='store', checked_at=timezone.now())
        for index in range(45):
            menu = Menu.objects.create(preprocess_row_id=f'm{index:02}', restaurant=cls.store, name=f'Menu {index:02}', category='Food', price_amount=index * 100)
            if index % 3 != 2:
                FoodDeclaration.objects.create(menu=menu, canonical_tag='milk', kind='allergen', name_raw='Milk',
                    presence='absent' if index % 3 == 0 else 'present', verification_status='verified',
                    source=cls.source, confirmed_at=timezone.now())
        rebuild()

    def menus(self, **extra):
        return list_menus(dict(sort='dietary', limit='20', **extra), DatabaseCatalogRepository(), profile=self.profile)

    def test_cold_index_creation_and_warm_query_have_the_same_results(self):
        MenuDietaryState.objects.update(dirty=True, engine_version=0, evaluation_data=None)
        available()  # Do not count one-time schema introspection as search work.
        with patch('catalog.dietary_index.rebuild', wraps=rebuild) as build, CaptureQueriesContext(connection) as cold:
            first = self.menus(judgement_status='match')
        build.assert_called_once()
        self.assertEqual(first['pagination']['total'], 15)
        self.assertFalse(MenuDietaryState.objects.filter(dirty=True).exists())

        with patch('catalog.dietary_index.rebuild', side_effect=AssertionError('warm query must not rebuild')), patch.object(
                DatabaseCatalogRepository, 'get_dietary_components', side_effect=AssertionError('warm query must use snapshots')), CaptureQueriesContext(connection) as warm:
            repeated = self.menus(judgement_status='match')
        self.assertEqual(repeated, first)
        self.assertGreater(len(cold), len(warm))
        self.assertFalse(any(q['sql'].lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')) for q in warm))

    def test_warm_query_count_is_constant_when_menu_count_grows(self):
        available()
        with CaptureQueriesContext(connection) as before:
            initial = self.menus()
        Menu.objects.bulk_create([
            Menu(preprocess_row_id=f'extra-{index:03}', restaurant=self.store, name=f'Extra {index:03}',
                 category='Food', price_amount=index * 100)
            for index in range(60)
        ])
        rebuild()  # Measure ready-index reads separately from ingestion work.
        with patch('catalog.dietary_index.rebuild', side_effect=AssertionError('index already prepared')), patch.object(
                DatabaseCatalogRepository, 'get_dietary_components', side_effect=AssertionError('no full evidence reads')), CaptureQueriesContext(connection) as after:
            grown = self.menus()
        self.assertEqual(initial['pagination']['total'], 45)
        self.assertEqual(grown['pagination']['total'], 105)
        self.assertEqual(len(grown['results']), 20)
        self.assertEqual(len(after), len(before))

    def test_detail_judgement_reuses_facts_but_rechecks_current_profile(self):
        session = self.client.session
        session['dietary_owner'] = str(self.profile.guest_id)
        session.save()
        with patch.object(DatabaseCatalogRepository, 'get_dietary_components', side_effect=AssertionError('snapshot should avoid evidence reads')):
            response = self.client.post('/api/judgements', {'menu_id': 'm00'}, content_type='application/json')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['status'], 'match')
            self.profile.criteria.add(Criterion.objects.get(code='allergen-egg'))
            changed = self.client.post('/api/judgements', {'menu_id': 'm00'}, content_type='application/json')
            self.assertEqual(changed.json()['status'], 'needs_check')
        self.profile.criteria.remove(Criterion.objects.get(code='allergen-egg'))
        FoodDeclaration.objects.filter(menu_id='m00').update(presence='present')
        refreshed = self.client.post('/api/judgements', {'menu_id': 'm00'}, content_type='application/json')
        self.assertEqual(refreshed.json()['status'], 'mismatch')

    def test_new_visitor_cards_do_not_build_unneeded_dietary_evidence(self):
        MenuDietaryState.objects.update(dirty=True, evaluation_data=None)
        with patch('catalog.dietary_index.rebuild', side_effect=AssertionError('unconfigured cards need no evaluation')):
            result = discover_restaurants(dict(personalize='true', view='card', sort='dietary'),
                DatabaseCatalogRepository(), self.empty)
        row = result['results'][0]
        self.assertTrue(row['personalization']['applied'])
        self.assertFalse(row['personalization']['profile_configured'])
        self.assertEqual(row['dietary_summary'], {
            'match_menu_count': 45, 'check_menu_count': 0, 'mismatch_menu_count': 0})

    def test_snapshot_context_reduces_detail_reads_without_changing_judgement(self):
        from dietary.services import EvaluationContext, evaluate
        available()
        with CaptureQueriesContext(connection) as original:
            expected = evaluate(self.profile, 'm00')
        with CaptureQueriesContext(connection) as optimized:
            context = EvaluationContext(self.profile)
            context.prime(['m00'])
            actual = evaluate(self.profile, 'm00', context=context)
        self.assertEqual(actual, expected)
        self.assertLess(len(optimized), len(original))

    def test_menu_parity_all_filters_pages_and_only_page_evidence(self):
        repo = DatabaseCatalogRepository()
        for status in ['', 'match', 'mismatch', 'needs_check']:
            for sort in ['dietary', 'price_asc', 'price_desc', 'menu_name_asc', 'distance_asc']:
                params = dict(sort=sort, limit='7', page='2', lat='36', lng='127', category='Food', region='Asan')
                if status:
                    params['judgement_status'] = status
                with override_settings(CATALOG_DIETARY_INDEX_ENABLED=False):
                    expected = list_menus(params, repo, profile=self.profile)
                actual = list_menus(params, repo, profile=self.profile)
                if not status and sort != 'dietary':
                    for row in actual['results']:
                        row.pop('judgement', None)
                self.assertEqual(actual, expected, (status, sort))
        with patch.object(repo, 'menu_candidates', side_effect=AssertionError('no catalog scan')), patch.object(
                DatabaseCatalogRepository, 'get_dietary_components', side_effect=AssertionError('no evidence queries')):
            result = list_menus(dict(sort='dietary', limit='20'), repo, profile=self.profile)
            self.assertEqual(len(result['results']), 20)

    def test_restaurant_parity(self):
        for status in ['', 'match', 'mismatch', 'needs_check']:
            params = dict(personalize='true', sort='dietary', lat='36', lng='127', bounds='126,35,128,37')
            if status:
                params['judgement_status'] = status
            with override_settings(CATALOG_DIETARY_INDEX_ENABLED=False):
                expected = discover_restaurants(params, DatabaseCatalogRepository(), self.profile)
            actual = discover_restaurants(params, DatabaseCatalogRepository(), self.profile)
            for key in expected['results'][0]:
                self.assertEqual(actual['results'][0][key], expected['results'][0][key], key)

    def test_bulk_sql_invalidation_and_lazy_rebuild(self):
        FoodDeclaration.objects.filter(menu_id='m00').update(presence='present')
        self.assertTrue(MenuDietaryState.objects.get(menu_id='m00').dirty)
        result = self.menus(judgement_status='match')
        self.assertEqual(result['pagination']['total'], 14)
        self.assertFalse(MenuDietaryState.objects.get(menu_id='m00').dirty)
        with connection.cursor() as cursor:
            cursor.execute('UPDATE catalog_menu SET category=%s WHERE preprocess_row_id=%s', ['Other', 'm01'])
        self.assertTrue(MenuDietaryState.objects.get(menu_id='m01').dirty)
        self.assertEqual(self.menus(category='Other')['pagination']['total'], 1)

    def test_expiry_and_rule_changes_cannot_leave_match(self):
        CatalogSource.objects.filter(pk=self.source.pk).update(valid_until=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.menus(judgement_status='match')['pagination']['total'], 0)
        criterion = Criterion.objects.get(code='allergen-milk')
        criterion.rule.enabled = False
        criterion.rule.save()
        self.assertTrue(MenuDietaryState.objects.filter(dirty=True).exists())
        self.assertEqual(self.menus(judgement_status='match')['pagination']['total'], 0)

    def test_unconfigured_matches_all_menus_and_pagination(self):
        result = list_menus(dict(sort='dietary', judgement_status='match'), DatabaseCatalogRepository(), profile=self.empty)
        self.assertEqual(result['pagination']['total'], 45)
        result = self.menus(page='999')
        self.assertEqual(result['results'], [])
        self.assertEqual(result['pagination']['total'], 45)

    def test_unconfigured_status_filters_and_restaurant_counts_match_both_paths(self):
        for enabled in (False, True):
            with override_settings(CATALOG_DIETARY_INDEX_ENABLED=enabled):
                for status, total in [('match', 45), ('needs_check', 0), ('mismatch', 0)]:
                    with self.subTest(index=enabled, status=status):
                        menus = list_menus(dict(sort='dietary', judgement_status=status, page='2', limit='7'),
                            DatabaseCatalogRepository(), profile=self.empty)
                        self.assertEqual(menus['pagination']['total'], total)
                        self.assertEqual(len(menus['results']), 7 if total else 0)
                        self.assertTrue(all(row['judgement']['status'] == 'match' for row in menus['results']))
                        for view in ('card', 'full'):
                            stores = discover_restaurants(dict(personalize='true', view=view, judgement_status=status),
                                DatabaseCatalogRepository(), self.empty)
                            self.assertEqual(stores['pagination']['total'], 1 if total else 0)
                            if stores['results']:
                                row = stores['results'][0]
                                self.assertEqual(row['dietary_summary']['match_menu_count'], 45)
                                self.assertEqual(row['dietary_summary']['check_menu_count'], 0)
                                self.assertTrue(row['personalization']['applied'])
                                self.assertFalse(row['personalization']['profile_configured'])

    def test_expiry_is_local_and_combined_conditions_keep_parity(self):
        source = CatalogSource.objects.create(title='Expiring', evidence_locator='record', source_type='store',
            checked_at=timezone.now(), valid_until=timezone.now() + timedelta(hours=1))
        FoodDeclaration.objects.filter(menu_id='m00').update(source=source)
        boundaries = next_boundaries(['m00', 'm01'])
        self.assertEqual(boundaries['m00'], source.valid_until)
        self.assertIsNone(boundaries['m01'])
        self.profile.criteria.add(Criterion.objects.get(code='allergen-egg'))
        rebuild()
        params = dict(sort='dietary', limit='20')
        with override_settings(CATALOG_DIETARY_INDEX_ENABLED=False):
            expected = list_menus(params, DatabaseCatalogRepository(), profile=self.profile)
        self.assertEqual(list_menus(params, DatabaseCatalogRepository(), profile=self.profile), expected)

    def test_restaurant_multi_store_sorts_and_pages_match_legacy(self):
        other = Restaurant.objects.create(place_id='other', name='Another', address='Asan', latitude=36.01, longitude=127)
        extra = Menu.objects.create(preprocess_row_id='other-menu', restaurant=other, name='Extra', category='Food', price_amount=50)
        FoodDeclaration.objects.create(menu=extra, canonical_tag='milk', kind='allergen', name_raw='Milk',
            presence='absent', verification_status='verified', source=self.source, confirmed_at=timezone.now())
        rebuild()
        for sort in ['dietary', 'price_asc', 'price_desc', 'restaurant_name_asc', 'distance_asc']:
            for page in ['1', '2', '3']:
                params = dict(personalize='true', sort=sort, limit='1', page=page, lat='36', lng='127', radius_km='3',
                    judgement_status='match', category='Food')
                with override_settings(CATALOG_DIETARY_INDEX_ENABLED=False):
                    expected = discover_restaurants(params, DatabaseCatalogRepository(), self.profile)
                self.assertEqual(discover_restaurants(params, DatabaseCatalogRepository(), self.profile), expected, (sort, page))

    def test_alias_search_and_profile_switch_do_not_reuse_wrong_results(self):
        Menu.objects.filter(pk='m00').update(data={'restaurant_search_names': ['Special Alias']})
        result = self.menus(q='special alias')
        self.assertEqual([row['menu_id'] for row in result['results']], ['m00'])
        self.profile.criteria.clear()
        self.assertEqual(self.menus(judgement_status='match')['pagination']['total'], 45)
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.assertEqual(self.menus(judgement_status='match')['pagination']['total'], 15)

    def test_restaurant_page_reuses_stored_evidence_without_split_menu_reads(self):
        from django.test.utils import CaptureQueriesContext
        from .dietary_index import available
        available()
        with patch.object(DatabaseCatalogRepository, 'get_dietary_components', side_effect=AssertionError('no full evidence read')), patch.object(
                DatabaseCatalogRepository, 'menu_summaries', side_effect=AssertionError('no separate menu read')), CaptureQueriesContext(connection) as queries:
            result = discover_restaurants(dict(personalize='true', sort='dietary', limit='20'), DatabaseCatalogRepository(), self.profile)
        self.assertLessEqual(len(queries), 5)
        self.assertEqual(result['results'][0]['dietary_summary']['match_menu_count'], 15)

    def test_card_view_matches_full_results_without_representative_or_detail_reads(self):
        from .discovery import restaurant_card
        for status in ['', 'match', 'mismatch', 'needs_check']:
            params = dict(personalize='true', sort='dietary', limit='20')
            if status: params['judgement_status'] = status
            full = discover_restaurants(params, DatabaseCatalogRepository(), self.profile)
            with patch.object(DatabaseCatalogRepository, 'restaurant_summaries', side_effect=AssertionError('no full detail read')), patch.object(
                    DatabaseCatalogRepository, 'get_dietary_components', side_effect=AssertionError('no evidence read')):
                card = discover_restaurants(dict(params, view='card'), DatabaseCatalogRepository(), self.profile)
            self.assertEqual(card['results'], [restaurant_card(row) for row in full['results']])
            self.assertEqual(card['pagination'], full['pagination'])
            self.assertTrue(all('representative_menu' not in row for row in card['results']))
            with override_settings(CATALOG_DIETARY_INDEX_ENABLED=False):
                fallback = discover_restaurants(dict(params, view='card'), DatabaseCatalogRepository(), self.profile)
            self.assertEqual(card, fallback)

    def test_hangul_region_search_does_not_compile_unicode_mapping(self):
        from catalog.query_expressions import UnicodeCasefold
        Restaurant.objects.filter(pk=self.store.pk).update(address='\ucda9\ub0a8 \uc544\uc0b0\uc2dc')
        rebuild()
        with patch.object(UnicodeCasefold, 'as_sqlite', side_effect=AssertionError('Hangul needs no casefold')):
            result = discover_restaurants(dict(personalize='true', sort='dietary', region='\uc544\uc0b0\uc2dc', view='card'), DatabaseCatalogRepository(), self.profile)
        self.assertEqual(result['pagination']['total'], 1)
