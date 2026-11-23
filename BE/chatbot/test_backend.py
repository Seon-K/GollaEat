import uuid
from unittest.mock import patch

from django.test import TestCase
from dietary.models import Criterion, Profile
from chatbot.backend import BackendSearch
from chatbot.chatbot import chat


class BackendSearchTests(TestCase):
    def setUp(self):
        self.profile = Profile.objects.create(guest_id=uuid.uuid4())
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.search = BackendSearch(self.profile)
        self.catalog = patch('chatbot.backend.get_catalog').start().return_value
        patch('dietary.services.get_catalog', return_value=self.catalog).start()
        self.addCleanup(patch.stopall)
        self.catalog.get_component.side_effect = lambda mid: {
            'present_tags': ['milk'] if mid == 'bad' else [],
            'absent_tags': ['milk'] if mid.startswith('ok') else [],
            'sources': [{'id': 'official'}]}

    def row(self, mid, rid, distance):
        return dict(menu_id=mid, menu_name=mid, restaurant_id=rid,
                    restaurant_name=rid, distance_m=distance)

    def test_real_judgement_grouping_distance_and_radius(self):
        self.catalog.search_menus.return_value = {'menus': [
            self.row('ok1', 'far', 500), self.row('bad', 'near', 50),
            self.row('unknown', 'near', 100), self.row('ok2', 'near', 100),
            self.row('ok3', 'near', 100), self.row('ok4', 'outside', 1001)]}
        result = self.search(dict(self.search.initial_state(), place='순천향대'))
        self.assertEqual([s['restaurant_id'] for s in result['matched']], ['near', 'far'])
        self.assertEqual(len(result['matched'][0]['menus']), 2)
        self.assertEqual(result['needs_check'][0]['menus'][0]['judgement']['status'], 'needs_check')
        self.assertEqual(result['matched'][0]['menus'][0]['judgement']['sources'], [{'id': 'official'}])

    def test_followup_and_temporary_conditions(self):
        self.catalog.search_menus.return_value = {'menus': [self.row('ok1', 'r', 100)]}
        state, result = chat('순천향대', self.search.initial_state(),
                             parse=lambda _: {'place': '순천향대'}, search=self.search)
        self.assertTrue(result['matched'])
        state, result = chat('대두도 빼줘', state,
                             parse=lambda _: {'ingredients': ['대두']}, search=self.search)
        self.assertEqual(result['criteria'], ['allergen-milk', 'allergen-soy'])
        self.assertTrue(result['needs_check'])
        self.assertEqual(state['place'], '순천향대')
        self.assertEqual(list(self.profile.criteria.values_list('code', flat=True)), ['allergen-milk'])

    def test_unavailable_and_ambiguous_place(self):
        from dietary.catalog import UnavailableCatalog
        with patch('chatbot.backend.get_catalog', return_value=UnavailableCatalog()):
            self.assertIn('위치', self.search(self.search.initial_state())['question'])
        self.catalog.search_menus.return_value = {'question': '어느 지점인가요?'}
        self.assertEqual(self.search(self.search.initial_state()), {'question': '어느 지점인가요?'})

    def test_unknown_condition_rejected_before_search(self):
        with self.assertRaises(ValueError):
            self.search(dict(self.search.initial_state(), ingredients=['없는 재료']))
        self.catalog.search_menus.assert_not_called()

    def test_coordinate_search_uses_catalog_services(self):
        from chatbot.catalog_search import nearby_menus, validate_location
        with patch('chatbot.catalog_search.get_repository') as factory:
            repository = factory.return_value
            repository.list_restaurants.return_value = [
                {'restaurant_id': 'r', 'restaurant_name': '가게', 'brand': '', 'address': ''}]
            repository.coordinates.return_value = {'r': (36.0, 127.0)}
            repository.get_restaurant.return_value = repository.list_restaurants.return_value[0]
            repository.list_restaurant_menus.return_value = [
                {'menu_id': 'm', 'menu_name': '김밥'}]
            result = nearby_menus({'location': {'lat': 36.0, 'lng': 127.0}, 'menu': '김밥'})
            self.assertEqual(result['menus'][0]['menu_id'], 'm')
            self.assertEqual(result['menus'][0]['distance_m'], 0)
            self.assertEqual(nearby_menus({'location': {'lat': 35.0, 'lng': 127.0}})['menus'], [])
        with self.assertRaises(ValueError):
            validate_location({'lat': True, 'lng': 127})


    def test_peanut_maps_to_existing_nuts_group(self):
        from chatbot.backend import criteria_codes
        self.assertEqual(criteria_codes({'ingredients': ['땅콩']}), ['allergen-nuts'])
        self.assertEqual(criteria_codes({'allergens': ['땅콩']}), ['allergen-nuts'])
