import uuid
from unittest.mock import patch

from django.test import TestCase
from dietary.models import Criterion, Profile
from AI.chatbot.backend import BackendSearch
from AI.chatbot.chatbot import chat


class BackendSearchTests(TestCase):
    def setUp(self):
        self.profile = Profile.objects.create(guest_id=uuid.uuid4())
        self.profile.criteria.add(Criterion.objects.get(code='allergen-milk'))
        self.search = BackendSearch(self.profile)
        self.catalog = patch('AI.chatbot.backend.get_catalog').start().return_value
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
        with patch('AI.chatbot.backend.get_catalog', return_value=UnavailableCatalog()):
            self.assertIn('연동 준비', self.search(self.search.initial_state())['question'])
        self.catalog.search_menus.return_value = {'question': '어느 지점인가요?'}
        self.assertEqual(self.search(self.search.initial_state()), {'question': '어느 지점인가요?'})

    def test_unknown_condition_rejected_before_search(self):
        with self.assertRaises(ValueError):
            self.search(dict(self.search.initial_state(), ingredients=['없는 재료']))
        self.catalog.search_menus.assert_not_called()
