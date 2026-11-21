"""Resolve search origins using Kakao Local keyword search."""
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def search_places(query):
    key = os.getenv('KAKAO_LOCAL_REST_API_KEY') or os.getenv('KAKAO_MOBILITY_REST_API_KEY')
    if not key:
        raise ValueError('Kakao REST API key is required')
    url = 'https://dapi.kakao.com/v2/local/search/keyword.json?' + urlencode({'query': query, 'size': 15})
    request = Request(url, headers={'Authorization': 'KakaoAK ' + key.strip()})
    with urlopen(request, timeout=10) as response:
        data = json.load(response)
    from .catalog_search import validate_location
    return [{'id': item['id'], 'name': item['place_name'],
             'address': item.get('road_address_name') or item['address_name'],
             'location': validate_location({'lat': float(item['y']), 'lng': float(item['x'])})}
            for item in data['documents']]
