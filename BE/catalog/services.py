import math

from .repository import MockMenuRepository, normalize_brand


ALLOWED_PARAMETERS = {'q', 'min_price', 'max_price', 'category', 'sort', 'page', 'limit'}
SORT_OPTIONS = {'menu_name_asc', 'price_asc', 'price_desc'}
RESTAURANT_PARAMETERS = {'q', 'brand', 'page', 'limit', 'lat', 'lng', 'radius_km', 'sort'}


def _coordinate_parameter(params, name, minimum, maximum):
    try:
        value = float(params[name])
    except (ValueError, TypeError, KeyError) as exc:
        raise MenuQueryError(name, f'{name} must be a number') from exc
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise MenuQueryError(name, f'{name} must be between {minimum} and {maximum}')
    return value


def haversine_km(lat, lng, other_lat, other_lng):
    a, b = math.radians(lat), math.radians(other_lat)
    dlat, dlng = b - a, math.radians(other_lng - lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(dlng / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1, max(0, h))))


class MenuQueryError(ValueError):
    def __init__(self, parameter, message):
        super().__init__(message)
        self.parameter = parameter


def _integer_parameter(params, name, default, minimum, maximum=None):
    raw_value = params.get(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise MenuQueryError(name, f'{name} must be an integer') from exc
    if value < minimum or (maximum is not None and value > maximum):
        expected = f'{minimum} or greater' if maximum is None else f'between {minimum} and {maximum}'
        raise MenuQueryError(name, f'{name} must be {expected}')
    return value


def _text_parameter(params, name, maximum_length):
    value = params.get(name, '').strip()
    if len(value) > maximum_length:
        raise MenuQueryError(name, f'{name} must be at most {maximum_length} characters')
    return value


def _serialize(menu):
    return {
        'menu_id': menu['menu_id'],
        'menu_name': menu['menu_name'],
        'restaurant': {
            'restaurant_id': menu['restaurant_id'],
            'restaurant_name': menu['restaurant_name'],
        },
        'category': menu['category'],
        'price': {
            'raw': menu['price_raw'],
            'amount': menu['price_amount'],
            'currency': 'KRW',
            'status': 'fixed',
        },
    }


def list_menus(params, repository=None):
    unknown = sorted(set(params.keys()) - ALLOWED_PARAMETERS)
    if unknown:
        raise MenuQueryError(unknown[0], f'unknown parameter: {unknown[0]}')

    query = _text_parameter(params, 'q', 100)
    category = _text_parameter(params, 'category', 50)
    min_price = _integer_parameter(params, 'min_price', 0, 0)
    max_price = _integer_parameter(params, 'max_price', None, 0)
    page = _integer_parameter(params, 'page', 1, 1)
    limit = _integer_parameter(params, 'limit', 20, 1, 100)
    sort = params.get('sort', 'menu_name_asc')

    if sort not in SORT_OPTIONS:
        raise MenuQueryError('sort', f'sort must be one of: {", ".join(sorted(SORT_OPTIONS))}')
    if max_price is not None and min_price > max_price:
        raise MenuQueryError('min_price', 'min_price must be less than or equal to max_price')

    menus = (repository or MockMenuRepository()).list_menus()
    normalized_query = query.casefold()
    normalized_category = category.casefold()

    if normalized_query:
        menus = [
            menu for menu in menus
            if normalized_query in menu['menu_name'].casefold()
            or normalized_query in menu['restaurant_name'].casefold()
        ]
    if normalized_category:
        menus = [menu for menu in menus if menu['category'].casefold() == normalized_category]

    menus = [
        menu for menu in menus
        if menu['price_amount'] >= min_price
        and (max_price is None or menu['price_amount'] <= max_price)
    ]

    if sort == 'price_asc':
        menus.sort(key=lambda menu: (menu['price_amount'], menu['menu_id']))
    elif sort == 'price_desc':
        menus.sort(key=lambda menu: (-menu['price_amount'], menu['menu_id']))
    else:
        menus.sort(key=lambda menu: (menu['menu_name'].casefold(), menu['menu_id']))

    total = len(menus)
    start = (page - 1) * limit
    selected = menus[start:start + limit]
    total_pages = math.ceil(total / limit) if total else 0

    return {
        'results': [_serialize(menu) for menu in selected],
        'pagination': {
            'page': page,
            'limit': limit,
            'count': len(selected),
            'total': total,
            'total_pages': total_pages,
            'next_page': page + 1 if page < total_pages else None,
            'previous_page': page - 1 if page > 1 and total else None,
        },
    }


def list_restaurants(params, repository):
    unknown = sorted(set(params.keys()) - RESTAURANT_PARAMETERS)
    if unknown:
        raise MenuQueryError(unknown[0], f'unknown parameter: {unknown[0]}')

    query = _text_parameter(params, 'q', 100)
    brand = _text_parameter(params, 'brand', 80)
    page = _integer_parameter(params, 'page', 1, 1)
    limit = _integer_parameter(params, 'limit', 20, 1, 100)

    has_location = 'lat' in params or 'lng' in params
    sort = params.get('sort', 'restaurant_name_asc')
    if sort not in {'restaurant_name_asc', 'distance_asc'}:
        raise MenuQueryError('sort', 'unsupported sort')
    if not has_location and ('radius_km' in params or sort == 'distance_asc'):
        raise MenuQueryError('lat', 'lat and lng are required for location search')
    if has_location:
        lat = _coordinate_parameter(params, 'lat', -90, 90)
        lng = _coordinate_parameter(params, 'lng', -180, 180)
    radius = None
    if 'radius_km' in params:
        radius = _coordinate_parameter(params, 'radius_km', 0, float('inf'))
        if radius <= 0:
            raise MenuQueryError('radius_km', 'radius_km must be positive')

    restaurants = repository.list_restaurants()
    normalized_query = query.casefold()
    normalized_brand = normalize_brand(brand)

    if normalized_query:
        restaurants = [
            restaurant for restaurant in restaurants
            if normalized_query in restaurant['restaurant_name'].casefold()
            or normalized_query in restaurant['brand'].casefold()
            or normalized_query in restaurant['address'].casefold()
        ]
    if normalized_brand:
        restaurants = [
            restaurant for restaurant in restaurants
            if normalize_brand(restaurant['brand']) == normalized_brand
        ]

    coordinates = repository.coordinates() if has_location else {}
    restaurants = [dict(item) for item in restaurants]
    for item in restaurants:
        point = coordinates.get(item['restaurant_id'])
        item['distance_km'] = haversine_km(lat, lng, *point) if point else None
    if radius is not None:
        restaurants = [item for item in restaurants if item['distance_km'] is not None
                       and item['distance_km'] <= radius]
    if sort == 'distance_asc':
        restaurants.sort(key=lambda item: (item['distance_km'] is None,
                         item['distance_km'] or 0, item['restaurant_id']))
    else:
        restaurants.sort(key=lambda restaurant: (restaurant['restaurant_name'].casefold(), restaurant['restaurant_id']))
    total = len(restaurants)
    start = (page - 1) * limit
    selected = restaurants[start:start + limit]
    total_pages = math.ceil(total / limit) if total else 0

    return {
        'results': selected,
        'pagination': {
            'page': page,
            'limit': limit,
            'count': len(selected),
            'total': total,
            'total_pages': total_pages,
            'next_page': page + 1 if page < total_pages else None,
            'previous_page': page - 1 if page > 1 and total else None,
        },
    }


def get_restaurant_detail(restaurant_id, repository):
    restaurant = repository.get_restaurant(restaurant_id)
    if restaurant is None:
        return None

    menu_references = repository.list_brand_menu_references(restaurant['brand'])
    return {
        **restaurant,
        'brand_menu_reference': {
            'match_method': 'normalized_brand_exact',
            'scope': 'brand_reference_only',
            'branch_sale_status': 'unverified',
            'notice': '브랜드 기준 참고 메뉴이며 이 지점의 실제 판매 여부는 확인되지 않았습니다.',
            'count': len(menu_references),
            'menus': menu_references,
        },
    }


def list_restaurant_menus(restaurant_id, params, repository):
    unknown = sorted(set(params.keys()) - {'q', 'page', 'limit'})
    if unknown:
        raise MenuQueryError(unknown[0], f'unknown parameter: {unknown[0]}')
    query = _text_parameter(params, 'q', 100).casefold()
    page = _integer_parameter(params, 'page', 1, 1)
    limit = _integer_parameter(params, 'limit', 20, 1, 100)
    detail = get_restaurant_detail(restaurant_id, repository)
    if detail is None:
        return None
    reference = detail['brand_menu_reference']
    menus = [menu for menu in reference['menus'] if query in menu['menu_name'].casefold()]
    menus.sort(key=lambda menu: (menu['menu_name'].casefold(), menu['menu_id']))
    total = len(menus)
    pages = math.ceil(total / limit)
    selected = menus[(page - 1) * limit:page * limit]
    return {
        'restaurant_id': restaurant_id, 'brand': detail['brand'],
        'scope': reference['scope'], 'branch_sale_status': 'unverified',
        'notice': reference['notice'], 'results': selected,
        'pagination': {'page': page, 'limit': limit, 'count': len(selected),
                       'total': total, 'total_pages': pages,
                       'next_page': page + 1 if page < pages else None,
                       'previous_page': page - 1 if page > 1 and total else None},
    }

