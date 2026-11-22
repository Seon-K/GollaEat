import json
from unittest.mock import patch
from django.test import Client, TestCase


class ChatApiTests(TestCase):
    def send(self, client, body):
        return client.post('/api/chat', json.dumps(body), content_type='application/json')

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
        self.assertIn('response_data', parse.call_args.kwargs)
        self.assertEqual(parse.call_count, 1)

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
