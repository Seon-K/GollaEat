"""External map URLs only; no routing API, travel-time or walking-distance calculation."""
import math
from urllib.parse import quote


def _valid(lat, lng):
    return (isinstance(lat, (int, float)) and not isinstance(lat, bool) and
        isinstance(lng, (int, float)) and not isinstance(lng, bool) and
        math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180)


def kakao_links(name, latitude, longitude, origin_lat=None, origin_lng=None):
    result = {'kakao_map_url': None, 'kakao_directions_url': None, 'walking_directions_url': None}
    if not _valid(latitude, longitude):
        return result
    destination = f'{quote(name or "목적지", safe="")},{latitude},{longitude}'
    result['kakao_map_url'] = 'https://map.kakao.com/link/map/' + destination
    result['kakao_directions_url'] = 'https://map.kakao.com/link/to/' + destination
    if _valid(origin_lat, origin_lng):
        origin = f'{quote("출발지", safe="")},{origin_lat},{origin_lng}'
        result['walking_directions_url'] = 'https://map.kakao.com/link/by/walk/' + origin + '/' + destination
    return result
