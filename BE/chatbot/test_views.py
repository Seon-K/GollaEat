import json
from unittest.mock import patch
from django.test import Client, TestCase
from chatbot.chatbot import GeminiUnavailable


class ChatApiTests(TestCase):
    @patch('chatbot.views.parse_gemini', side_effect=GeminiUnavailable('Gemini HTTP 503'))
    def test_provider_failure_keeps_conversation(self, parse):
        client = Client()
        session = client.session
        session['chat_state'] = {'radius_m': 1000, 'place': 'school', 'allergens': ['우유']}
        session['chat_history'] = [{'user': 'previous', 'assistant': 'previous'}]
        session.save()
        before = dict(client.session)
        response = self.send(client, {'message': '점심 추천'})
        self.assertEqual(response.status_code, 503)
        self.assertIn('같은 질문', response.json()['message'])
        self.assertEqual(client.session['chat_state'], before['chat_state'])
        self.assertEqual(client.session['chat_history'], before['chat_history'])

    def send(self, client, body):
        return client.post('/api/chat', json.dumps(body), content_type='application/json')

    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini')
    def test_search_ignores_invented_menu_id_and_continues_place_selection(self, parse, search):
        location = {'lat': 36.77, 'lng': 126.93}
        candidates = {'question': '검색 기준 장소를 선택해 주세요.',
                      'place_candidates': [{'name': '순천향대학교', 'location': location}]}
        cards = {'matched': [], 'needs_check': []}
        search.side_effect = [candidates, cards]
        for intent in (None, 'search'):
            with self.subTest(intent=intent):
                change = {'place': '순천향대', 'allergens': ['우유'], 'menu_id': 'invented'}
                if intent:
                    change['intent'] = intent
                parse.return_value = change
                search.side_effect = [candidates, cards]
                client = Client()
                response = self.send(client, {'message': '순천향대 근처 점심 추천해줘'})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['result']['place_candidates'], candidates['place_candidates'])
                self.assertNotIn('menu_id', response.json()['state'])
                self.assertEqual(response.json()['state']['place'], '순천향대')
                parse.reset_mock()
                response = self.send(client, {'message': '', 'location': location})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['result']['needs_check'], [])
                self.assertEqual(search.call_args.args[0]['location'], location)
                self.assertEqual(search.call_args.args[0]['allergens'], ['우유'])
                parse.assert_not_called()

    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini')
    def test_explanation_rejects_invented_menu_id(self, parse, search):
        parse.return_value = {'intent': 'explain', 'menu_id': 'invented'}
        response = self.send(Client(), {'message': '이 메뉴의 재료 알려줘'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['result']['question'], '확인할 매장명과 메뉴명을 알려주세요.')
        search.assert_not_called()

    @patch('chatbot.views.parse_gemini')
    def test_followup_reset_and_isolation(self, parse):
        a, b = Client(), Client()
        parse.return_value = {'place': '순천향대', 'allergens': ['우유']}
        result = self.send(a, {'message': '검색'}).json()
        self.assertEqual(result['state']['allergens'], ['우유'])
        parse.return_value = {'menu': '김밥'}
        result = self.send(a, {'message': '김밥'}).json()
        self.assertEqual(result['state']['place'], '순천향대')
        self.assertNotIn('place', self.send(b, {'message': '김밥'}).json()['state'])
        result = self.send(a, {'new_conversation': True}).json()
        self.assertNotIn('allergens', result['state'])

    @patch('chatbot.views.parse_gemini', side_effect=ValueError('failed'))
    def test_failure_preserves_state(self, parse):
        c = Client()
        self.send(c, {'new_conversation': True})
        before = c.session['chat_state']
        self.assertEqual(self.send(c, {'message': '질문'}).status_code, 503)
        self.assertEqual(c.session['chat_state'], before)

    def test_validation_and_csrf(self):
        self.assertEqual(self.send(Client(), {'message': ''}).status_code, 400)
        self.assertEqual(self.send(Client(), {'new_conversation': 'yes'}).status_code, 400)
        self.assertEqual(self.send(Client(enforce_csrf_checks=True), {'message': '질문'}).status_code, 403)

    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini')
    def test_selected_location_skips_interpretation_and_returns_results(self, parse, search):
        search.return_value = {'matched': [], 'needs_check': [], 'criteria': []}
        parse.return_value = {'answer': '검색 결과가 없어요.'}
        response = self.send(Client(), {'location': {'lat': 36.77, 'lng': 126.93}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(search.call_args.args[0]['location']['lat'], 36.77)
        parse.assert_not_called()

    @patch('chatbot.views.parse_gemini')
    def test_recent_history_is_passed_to_model(self, parse):
        parse.return_value = {'question': '어느 장소인가요?'}
        client = Client()
        self.send(client, {'message': '점심 찾아줘'})
        self.send(client, {'message': '순천향대'})
        context = parse.call_args.kwargs['context']
        self.assertEqual(context['history'][0]['user'], '점심 찾아줘')
        self.send(client, {'new_conversation': True})
        self.assertEqual(client.session['chat_history'], [])

    @patch('chatbot.views.parse_gemini')
    def test_unknown_criterion_is_question_not_service_failure(self, parse):
        parse.return_value = {'intent': 'search', 'ingredients': ['unsupported-food']}
        response = self.send(Client(), {'message': 'avoid this'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('question', response.json()['result'])

    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini', side_effect=ValueError('generation failed'))
    def test_summary_fallback_preserves_cards_without_listing(self, parse, search):
        result = {'matched': [], 'needs_check': [
            {'restaurant': 'unique-store', 'distance_m': 100,
             'menus': [{'menu_id': 'm', 'name': 'unique-menu', 'reason': 'unknown'}]}]}
        search.return_value = result
        response = self.send(Client(), {'location': {'lat': 36, 'lng': 127}}).json()
        self.assertEqual(response['result'], result)
        self.assertNotIn('unique-store', response['message'])
        parse.assert_not_called()

    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini')
    def test_expansion_reuses_location_and_advances_by_one_kilometer(self, parse, search):
        search.side_effect = lambda state: {
            'matched': [], 'needs_check': [], 'radius_m': state['radius_m'],
        }
        client = Client()
        location = {'lat': 36.77, 'lng': 126.93}
        initial = self.send(client, {'location': location}).json()
        self.assertEqual(initial['result']['next_radius_m'], 2000)
        parse.reset_mock()
        for radius in (2000, 2000, 3000, 4000, 5000):
            response = self.send(client, {'radius_m': radius})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['result']['radius_m'], radius)
            self.assertEqual(search.call_args.args[0]['location'], location)
        self.assertIsNone(response.json()['result']['next_radius_m'])
        self.assertEqual(self.send(client, {'radius_m': 6000}).status_code, 400)
        parse.assert_not_called()

    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini')
    def test_new_question_resets_radius_in_existing_session(self, parse, search):
        parse.side_effect = lambda *args, **kwargs: (
            {'answer': 'Summary'} if 'response_data' in kwargs else {'menu': 'udon', 'allergens': ['\uC6B0\uC720']}
        )
        search.side_effect = lambda state: {
            'matched': [], 'needs_check': [], 'radius_m': state['radius_m'],
        }
        client = Client()
        location = {'lat': 36.77, 'lng': 126.93}
        self.send(client, {'location': location})
        self.assertEqual(self.send(client, {'radius_m': 2000}).status_code, 200)
        response = self.send(client, {'message': 'Switch to udon'}).json()
        self.assertEqual(response['result']['radius_m'], 1000)
        self.assertEqual(response['result']['next_radius_m'], 2000)
        self.assertEqual(response['state']['location'], location)
        self.assertEqual(response['state']['menu'], 'udon')


    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini')
    def test_search_only_calls_model_for_interpretation(self, parse, search):
        parse.return_value = {'intent': 'search', 'allergens': ['milk']}
        search.return_value = {'matched': [], 'needs_check': []}
        response = self.send(Client(), {'message': 'Find lunch',
            'location': {'lat': 36, 'lng': 127}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(parse.call_count, 1)
        self.assertIn('context', parse.call_args.kwargs)

    @patch('chatbot.views.BackendSearch.__call__')
    @patch('chatbot.views.parse_gemini')
    def test_explanation_still_generates_answer_and_falls_back(self, parse, search):
        search.return_value = {'explanation': 'Evidence from backend'}
        parse.side_effect = [
            {'intent': 'explain'}, {'answer': 'Generated explanation'},
            {'intent': 'explain'}, ValueError('model unavailable'),
        ]
        client = Client()
        response = self.send(client, {'message': 'Explain ingredients'}).json()
        self.assertEqual(response['message'], 'Generated explanation')
        response = self.send(client, {'message': 'Explain again'}).json()
        self.assertEqual(response['message'], 'Evidence from backend')
        self.assertIn('response_data', parse.call_args.kwargs)