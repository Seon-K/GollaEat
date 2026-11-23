import io
import json
import os
from unittest import TestCase
from unittest.mock import patch
from urllib.error import HTTPError

from chatbot.chatbot import GeminiUnavailable, parse_gemini


class ProviderTests(TestCase):
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test', 'GEMINI_API_KEY': 'test',
                             'OPENROUTER_MODEL': 'openrouter/free'})
    @patch('chatbot.chatbot.urlopen')
    def test_optional_null_does_not_trigger_fallback(self, request):
        request.return_value = io.BytesIO(json.dumps({'choices': [{
            'finish_reason': 'stop', 'message': {'content': json.dumps({
                'intent': 'search', 'result_filter': 'all', 'place': 'school',
                'menu_id': None, 'restaurant': None})}}]}).encode())
        result = parse_gemini('lunch near school')
        self.assertEqual(result['place'], 'school')
        self.assertNotIn('menu_id', result)
        self.assertNotIn('result_filter', result)
        self.assertEqual(request.call_count, 1)

    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test', 'GEMINI_API_KEY': 'test'})
    @patch('chatbot.chatbot.parse_openrouter', side_effect=ValueError('Invalid enum field: intent'))
    @patch('chatbot.chatbot.urlopen')
    def test_invalid_router_response_falls_back(self, request, router):
        request.return_value = io.BytesIO(json.dumps({'candidates': [{
            'finishReason': 'STOP', 'content': {'parts': [{'text': '{"intent":"search"}'}]}
        }]}).encode())
        self.assertEqual(parse_gemini('lunch'), {'intent': 'search'})
        self.assertEqual(request.call_count, 1)

    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test', 'GEMINI_API_KEY': 'test'})
    @patch('chatbot.chatbot.parse_openrouter', side_effect=TimeoutError())
    @patch('chatbot.chatbot.urlopen')
    def test_both_providers_fail(self, request, router):
        request.side_effect = HTTPError('https://example.test', 503, 'Unavailable', {}, None)
        with self.assertRaises(GeminiUnavailable):
            parse_gemini('lunch')
