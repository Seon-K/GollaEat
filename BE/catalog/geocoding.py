"""Opt-in provider boundary. Search results are proposals, never verified coordinates."""
import json
import math
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from .models import Restaurant, GeocodeAttempt


class Geocoder:
    name = 'unconfigured'

    def is_configured(self):
        return False

    def search(self, *, address, place_name, mode):
        """Return {'candidates': [{latitude, longitude, label, address, external_id}], 'has_more': bool}."""
        raise NotImplementedError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Do not forward the authorization header to another host.
        return None


class KakaoGeocoder(Geocoder):
    """Optional adapter, not selected by default. Docs: developers.kakao.com/docs/ko/local/dev-guide"""
    name = 'kakao'

    def is_configured(self):
        return bool(settings.CATALOG_GEOCODER_API_KEY.strip())

    def search(self, *, address, place_name, mode):
        if not self.is_configured():
            raise ValueError('Geocoder is not configured')
        endpoint = 'address' if mode == 'address' else 'keyword'
        query = address if mode == 'address' else ' '.join(filter(None, [address, place_name]))
        url = f'https://dapi.kakao.com/v2/local/search/{endpoint}.json?' + urlencode({'query': query, 'size': 5, 'page': 1})
        request = Request(url, headers={'Authorization': 'KakaoAK ' + settings.CATALOG_GEOCODER_API_KEY})
        timeout = float(settings.CATALOG_GEOCODER_TIMEOUT)
        if not math.isfinite(timeout) or not 0 < timeout <= 30:
            raise ValueError('Invalid geocoder timeout')
        with build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            body = response.read(1024 * 1024 + 1)
        if len(body) > 1024 * 1024:
            raise ValueError('Geocoder response exceeds limit')
        payload = json.loads(body)
        documents, meta = payload['documents'], payload['meta']
        if not isinstance(documents, list) or not isinstance(meta, dict) or not isinstance(meta.get('is_end'), bool):
            raise ValueError('Invalid geocoder response')
        return {'candidates': [{'latitude': d['y'], 'longitude': d['x'],
            'label': d.get('place_name') or d.get('address_name') or '',
            'address': d.get('road_address_name') or d.get('address_name') or '',
            'external_id': str(d.get('id') or '')} for d in documents],
            'has_more': not meta['is_end'] or meta.get('total_count', 0) > len(documents)}


def _authorize(actor):
    if not actor or not actor.is_active or not actor.is_staff or not actor.has_perm('catalog.change_restaurant'):
        raise PermissionDenied


def propose_coordinates(restaurant, actor, mode='address'):
    _authorize(actor)
    if mode not in {'address', 'place'} or not (restaurant.address if mode == 'address' else restaurant.name):
        raise ValidationError('변환할 주소 또는 장소명이 필요합니다.')
    status, candidates, provider_name = 'not_configured', [], 'unconfigured'
    try:
        provider = import_string(settings.CATALOG_GEOCODER)()
        if not isinstance(provider, Geocoder):
            raise ValueError('Invalid geocoder class')
        provider_name = provider.name[:200]
        if provider.is_configured():
            result = provider.search(address=restaurant.address, place_name=restaurant.name, mode=mode)
            raw = result['candidates']
            if not isinstance(raw, list) or len(raw) > 100 or not isinstance(result.get('has_more'), bool):
                raise ValueError('Invalid candidate list')
            for item in raw:
                if isinstance(item.get('latitude'), bool) or isinstance(item.get('longitude'), bool):
                    raise ValueError('Invalid candidate coordinates')
                a, b = float(item['latitude']), float(item['longitude'])
                if not math.isfinite(a) or not math.isfinite(b) or not -90 <= a <= 90 or not -180 <= b <= 180:
                    raise ValueError('Invalid candidate coordinates')
                candidates.append({'latitude': a, 'longitude': b, 'label': str(item.get('label', ''))[:500],
                    'address': str(item.get('address', ''))[:1000], 'external_id': str(item.get('external_id', ''))[:200]})
            if not candidates and not result['has_more']:
                status = 'not_found'
            elif len(candidates) != 1 or result['has_more']:
                status = 'ambiguous'
            elif restaurant.latitude is not None or restaurant.longitude is not None:
                status = ('unchanged' if (restaurant.latitude, restaurant.longitude) ==
                    (candidates[0]['latitude'], candidates[0]['longitude']) else 'conflict')
            else:
                status = 'proposed'
    except Exception:
        # Never expose provider exception text, response bodies, request headers or API keys.
        status, candidates = 'error', []
    return GeocodeAttempt.objects.create(restaurant=restaurant, provider=provider_name, mode=mode,
        query_address=restaurant.address, query_place_name=restaurant.name,
        existing_latitude=restaurant.latitude, existing_longitude=restaurant.longitude,
        status=status, candidates=candidates, requested_by=actor)


@transaction.atomic
def apply_coordinates(attempt_id, actor):
    _authorize(actor)
    attempt = GeocodeAttempt.objects.select_for_update().get(pk=attempt_id)
    restaurant = Restaurant.objects.select_for_update().get(pk=attempt.restaurant_id)
    if attempt.status != 'proposed' or len(attempt.candidates) != 1:
        raise ValidationError('단일 신규 좌표 후보만 적용할 수 있습니다.')
    if restaurant.latitude is not None or restaurant.longitude is not None:
        raise ValidationError('기존 좌표를 덮어쓰지 않습니다.')
    if restaurant.address != attempt.query_address or restaurant.name != attempt.query_place_name:
        raise ValidationError('주소 또는 장소명이 변경되어 다시 조회해야 합니다.')
    point = attempt.candidates[0]
    restaurant.latitude, restaurant.longitude = point['latitude'], point['longitude']
    restaurant.full_clean()
    restaurant.save(update_fields=['latitude', 'longitude'])
    attempt.status, attempt.applied_by, attempt.applied_at = 'applied_unverified', actor, timezone.now()
    attempt.save(update_fields=['status', 'applied_by', 'applied_at'])
    return attempt


def attempt_json(item):
    return {'attempt_id': item.pk, 'restaurant_id': item.restaurant_id, 'provider': item.provider,
        'mode': item.mode, 'status': item.status, 'candidates': item.candidates,
        'coordinate_verification_status': 'unverified', 'created_at': item.created_at, 'applied_at': item.applied_at}
