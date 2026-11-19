import json
from unittest.mock import patch
from django.test import Client, TestCase


class ChatApiTests(TestCase):
    def send(self, client, body):
        return client.post('/api/chat', json.dumps(body), content_type='application/json')

    @patch('AI.chatbot.views.parse_gemini')
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

    @patch('AI.chatbot.views.parse_gemini', side_effect=ValueError('failed'))
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
