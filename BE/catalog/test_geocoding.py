import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
from django.test import Client, TestCase, override_settings

from .models import Restaurant, GeocodeAttempt
from .geocoding import Geocoder, KakaoGeocoder, propose_coordinates, apply_coordinates, NoRedirect


class FakeGeocoder(Geocoder):
    name = 'test-provider'

    def __init__(self):
        self.result = {'candidates': [{'latitude': 36.78, 'longitude': 127.05, 'label': '테스트 장소'}], 'has_more': False}

    def is_configured(self):
        return True

    def search(self, **kwargs):
        return self.result


@override_settings(CATALOG_USE_DB=True, CATALOG_GEOCODER='catalog.geocoding.Geocoder', CATALOG_GEOCODER_API_KEY='')
class GeocodingTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(place_id='geo-1', name='테스트 매장', address='아산시 배방읍')
        self.user = get_user_model().objects.create_user('geocoder-staff', is_staff=True)
        self.user.user_permissions.add(Permission.objects.get(content_type__app_label='catalog', codename='change_restaurant'))
        self.user = get_user_model().objects.get(pk=self.user.pk)
        self.fake = FakeGeocoder()

    def propose(self):
        with patch('catalog.geocoding.import_string', return_value=lambda: self.fake):
            return propose_coordinates(self.restaurant, self.user)

    def test_disabled_and_missing_key_do_not_call_network(self):
        with patch('catalog.geocoding.build_opener') as opener:
            self.assertEqual(propose_coordinates(self.restaurant, self.user).status, 'not_configured')
            with override_settings(CATALOG_GEOCODER='catalog.geocoding.KakaoGeocoder'):
                self.assertEqual(propose_coordinates(self.restaurant, self.user).status, 'not_configured')
            opener.assert_not_called()
        self.restaurant.refresh_from_db()
        self.assertIsNone(self.restaurant.latitude)

    def test_single_candidate_explicit_apply_stays_unverified(self):
        attempt = self.propose()
        self.assertEqual(attempt.status, 'proposed')
        self.restaurant.refresh_from_db()
        self.assertIsNone(self.restaurant.latitude)
        applied = apply_coordinates(attempt.pk, self.user)
        self.assertEqual(applied.status, 'applied_unverified')
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.latitude, 36.78)
        detail = self.client.get('/api/restaurants/' + self.restaurant.pk).json()
        self.assertEqual(detail['coordinate_verification_status'], 'manual_changed_unverified')
        with self.assertRaises(ValidationError):
            apply_coordinates(attempt.pk, self.user)

    def test_empty_duplicate_and_pagination_results_are_not_applied(self):
        for candidates, more, status in [([], False, 'not_found'),
            ([{'latitude': 36.78, 'longitude': 127.05}] * 2, False, 'ambiguous'),
            ([{'latitude': 36.78, 'longitude': 127.05}], True, 'ambiguous')]:
            with self.subTest(status=status):
                self.fake.result = {'candidates': candidates, 'has_more': more}
                attempt = self.propose()
                self.assertEqual(attempt.status, status)
                with self.assertRaises(ValidationError):
                    apply_coordinates(attempt.pk, self.user)
        self.restaurant.refresh_from_db()
        self.assertIsNone(self.restaurant.longitude)

    def test_existing_coordinates_unchanged_and_conflict(self):
        self.restaurant.latitude, self.restaurant.longitude = 35, 126
        self.restaurant.save()
        self.assertEqual(self.propose().status, 'conflict')
        self.fake.result['candidates'] = [{'latitude': 35, 'longitude': 126}]
        self.assertEqual(self.propose().status, 'unchanged')
        self.restaurant.refresh_from_db()
        self.assertEqual((self.restaurant.latitude, self.restaurant.longitude), (35, 126))

    def test_stale_context_and_concurrent_coordinates_block_apply(self):
        attempt = self.propose()
        Restaurant.objects.filter(pk=self.restaurant.pk).update(address='다른 주소')
        with self.assertRaises(ValidationError):
            apply_coordinates(attempt.pk, self.user)
        Restaurant.objects.filter(pk=self.restaurant.pk).update(address=self.restaurant.address, latitude=35, longitude=126)
        with self.assertRaises(ValidationError):
            apply_coordinates(attempt.pk, self.user)

    def test_upstream_failure_and_invalid_coordinates_are_sanitized(self):
        with patch.object(self.fake, 'search', side_effect=ValueError('test-only-secret-must-not-leak')):
            attempt = self.propose()
            self.assertEqual(attempt.status, 'error')
            self.assertEqual(attempt.candidates, [])
        for point in [{'latitude': 'NaN', 'longitude': 127}, {'latitude': 91, 'longitude': 127}]:
            self.fake.result = {'candidates': [point], 'has_more': False}
            self.assertEqual(self.propose().status, 'error')

    def test_http_api_requires_staff_permission_and_csrf(self):
        client = Client(enforce_csrf_checks=True)
        url = '/api/restaurants/' + self.restaurant.pk + '/geocode'
        self.assertEqual(client.post(url, '{}', content_type='application/json').status_code, 403)
        client.force_login(self.user)
        token = client.get('/api/session').json()['csrf_token']
        self.assertEqual(client.post(url, '{}', content_type='application/json').status_code, 403)
        self.assertEqual(client.get(url).status_code, 405)
        with patch('catalog.geocoding.import_string', return_value=lambda: self.fake):
            response = client.post(url, json.dumps({'mode': 'place'}), content_type='application/json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'proposed')
        apply_url = '/api/geocoding/' + str(response.json()['attempt_id']) + '/apply'
        applied = client.post(apply_url, '{}', content_type='application/json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(applied.json()['status'], 'applied_unverified')
        unprivileged = get_user_model().objects.create_user('staff-no-geo', is_staff=True)
        client.force_login(unprivileged)
        token = client.get('/api/session').json()['csrf_token']
        self.assertEqual(client.post(url, '{}', content_type='application/json', HTTP_X_CSRFTOKEN=token).status_code, 403)

    @override_settings(CATALOG_GEOCODER_API_KEY='test-only', CATALOG_GEOCODER_TIMEOUT='5')
    def test_opt_in_kakao_adapter_contract_with_mocked_http(self):
        with patch('catalog.geocoding.build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps({
                'documents': [{'x': '127.05', 'y': '36.78', 'address_name': '주소'}],
                'meta': {'is_end': False, 'total_count': 2}}).encode()
            for mode, endpoint in [('address', 'address'), ('place', 'keyword')]:
                result = KakaoGeocoder().search(address='아산시', place_name='매장', mode=mode)
                request = opener.return_value.open.call_args.args[0]
                self.assertIn('/search/' + endpoint + '.json?', request.full_url)
                self.assertEqual(request.get_header('Authorization'), 'KakaoAK test-only')
                self.assertNotIn('test-only', request.full_url)
                self.assertTrue(result['has_more'])
                self.assertEqual(result['candidates'][0]['longitude'], '127.05')
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.com'))
