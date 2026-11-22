from django.test import SimpleTestCase
from urllib.parse import unquote
from .map_links import kakao_links


class MapLinkTests(SimpleTestCase):
    def test_map_and_walking_url_without_api_calls(self):
        links = kakao_links('매장,이름/안내', 36.78, 127.05, 36.7, 127.0)
        self.assertIn('/link/map/', links['kakao_map_url'])
        self.assertIn('%2C', links['kakao_map_url'])
        self.assertIn('%2F', links['kakao_map_url'])
        self.assertIn('/link/by/walk/', links['walking_directions_url'])
        self.assertTrue(unquote(links['walking_directions_url']).endswith('매장,이름/안내,36.78,127.05'))

    def test_no_origin_does_not_invent_walking_start(self):
        links = kakao_links('매장', 36.78, 127.05)
        self.assertIsNotNone(links['kakao_directions_url'])
        self.assertIsNone(links['walking_directions_url'])

    def test_invalid_destination_is_unknown(self):
        for lat, lng in [(None, None), (float('nan'), 127), (91, 127), (True, 127)]:
            self.assertTrue(all(v is None for v in kakao_links('매장', lat, lng).values()))
