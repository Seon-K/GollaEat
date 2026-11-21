import math

from catalog.final_repository import get_repository
from catalog.services import list_restaurants, list_restaurant_menus


def validate_location(location):
    if not isinstance(location, dict):
        raise ValueError('location must contain lat and lng')
    for key, bound in [('lat', 90), ('lng', 180)]:
        value = location.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not -bound <= value <= bound:
            raise ValueError('Invalid location ' + key)
    return {key: location[key] for key in ('lat', 'lng')}


def nearby_menus(state):
    if state.get('place'):
        return {'question': '요청한 장소의 좌표를 선택해 주세요. 장소명 검색 연결이 필요해요.'}
    if not state.get('location'):
        return {'question': '주변 검색을 위해 위치를 선택해 주세요.'}
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
