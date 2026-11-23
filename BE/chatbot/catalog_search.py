import math

from catalog.final_repository import get_repository
from catalog.services import list_restaurants, list_restaurant_menus, haversine_km
from django.conf import settings


def validate_location(location):
    if not isinstance(location, dict):
        raise ValueError('location must contain lat and lng')
    for key, bound in [('lat', 90), ('lng', 180)]:
        value = location.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not -bound <= value <= bound:
            raise ValueError('Invalid location ' + key)
    return {key: location[key] for key in ('lat', 'lng')}


def nearby_menus(state):
    if state.get('place') and state.get('resolved_place') != state['place']:
        from .places import search_places
        try:
            candidates = search_places(state['place'])
        except (OSError, ValueError, KeyError, TypeError):
            return {'question': '장소 검색을 완료하지 못했어요. 잠시 후 다시 시도하거나 지도에서 위치를 선택해 주세요.'}
        if len(candidates) != 1:
            return {'question': '검색 기준 장소를 선택해 주세요.' if candidates else '장소를 찾지 못했어요. 주소나 더 구체적인 장소명을 입력해 주세요.',
                    'place_candidates': candidates}
        state['location'] = candidates[0]['location']
        state['resolved_place'] = state['place']
    if not state.get('location'):
        return {'question': '주변 검색을 위해 위치를 선택해 주세요.'}
    if settings.CATALOG_USE_DB:
        return database_nearby_menus(state)
    repository = get_repository()
    params = {key: str(value) for key, value in validate_location(state['location']).items()}
    params.update(radius_km=str(state.get('radius_m', 1000) / 1000), sort='distance_asc', limit='100')
    if state.get('restaurant'):
        params['q'] = state['restaurant']
    rows = []
    page = 1
    while page:
        params['page'] = str(page)
        stores = list_restaurants(params, repository)
        for store in stores['results']:
            menu_page = 1
            while menu_page:
                menus = list_restaurant_menus(store['restaurant_id'],
                    {'q': state.get('menu', ''), 'page': str(menu_page), 'limit': '100'}, repository)
                if menus is None:
                    break
                for menu in menus['results']:
                    rows.append({'restaurant_id': store['restaurant_id'],
                                 'restaurant_name': store['restaurant_name'],
                                 'menu_id': menu['menu_id'], 'menu_name': menu['menu_name'],
                                 'distance_m': store['distance_km'] * 1000,
                                 'branch_sale_status': menus['branch_sale_status']})
                menu_page = menus['pagination']['next_page']
        page = stores['pagination']['next_page']
    return {'menus': rows}


def database_nearby_menus(state):
    # Only fields needed to select candidates; evidence is loaded by EvaluationContext.
    from catalog.models import Restaurant, Menu

    location = validate_location(state['location'])
    radius_km = state.get('radius_m', 1000) / 1000
    restaurant_query = state.get('restaurant', '').casefold()
    stores = {}
    candidates = Restaurant.objects.exclude(latitude=None).exclude(longitude=None)
    for store in candidates.values('pk', 'name', 'latitude', 'longitude').iterator(chunk_size=500):
        if restaurant_query not in store['name'].casefold():
            continue
        distance = haversine_km(location['lat'], location['lng'],
                                store['latitude'], store['longitude'])
        if distance <= radius_km:
            stores[store['pk']] = (store['name'], distance * 1000)
    if not stores:
        return {'menus': []}
    query = state.get('menu', '').casefold()
    rows = []
    menus = Menu.objects.filter(restaurant_id__in=stores).values(
        'pk', 'name', 'restaurant_id')
    for menu in menus.iterator(chunk_size=500):
        if query not in menu['name'].casefold():
            continue
        restaurant_name, distance = stores[menu['restaurant_id']]
        rows.append({
            'restaurant_id': menu['restaurant_id'], 'restaurant_name': restaurant_name,
            'menu_id': menu['pk'], 'menu_name': menu['name'], 'distance_m': distance,
            'branch_sale_status': 'unverified',
        })
    rows.sort(key=lambda row: (row['distance_m'], row['restaurant_id'],
                              row['menu_name'].casefold(), row['menu_id']))
    return {'menus': rows}
