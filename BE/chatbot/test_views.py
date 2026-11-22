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
    @patch('chatbot.views.parse_gemini', return_value={
        'place': '순천향대', 'menu': '김밥', 'allergens': ['우유'],
    })
    def test_place_selection_reuses_conditions_without_parsing(self, parse, search):
        location = {'lat': 36.77, 'lng': 126.93}
        search.side_effect = [
            {'question': '장소를 선택해 주세요.', 'place_candidates': [{'location': location}]},
            {'matched': [], 'needs_check': [{
                'restaurant': '예시 분식점', 'distance_m': 150,
                'menus': [{'name': '김밥', 'reason': '우유 정보 확인 필요'}],
            }]},
        ]
        client = Client()
        self.assertEqual(self.send(client, {'message': '순천향대 근처 김밥 찾아줘'}).status_code, 200)
        response = self.send(client, {'location': location})
        self.assertEqual(response.status_code, 200)
        parse.assert_called_once()
        state = search.call_args.args[0]
        self.assertEqual(state['location'], location)
        self.assertEqual(state['menu'], '김밥')
        self.assertEqual(state['allergens'], ['우유'])
        self.assertNotIn('place', state)
        self.assertEqual(response.json()['result']['needs_check'][0]['restaurant'], '예시 분식점')
