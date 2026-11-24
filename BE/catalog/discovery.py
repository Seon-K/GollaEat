"""Map discovery: filter and evaluate menus before restaurant pagination."""
import math
from .services import (MenuQueryError, _boolean_parameter, _coordinate_parameter,
                       _integer_parameter, _text_parameter, haversine_km, _serialize, judgement_status_parameter)
from .repository import normalize_brand

MAX_RADIUS_KM = 100
MAX_BOUNDS_SPAN = 2


def parse_area(params):
    lat = lng = radius = bounds = None
    if 'lat' in params or 'lng' in params:
        lat = _coordinate_parameter(params, 'lat', -90, 90)
        lng = _coordinate_parameter(params, 'lng', -180, 180)
    if 'radius_km' in params:
        radius = _coordinate_parameter(params, 'radius_km', 0, MAX_RADIUS_KM)
        if radius <= 0 or lat is None:
            raise MenuQueryError('radius_km', 'positive radius requires lat and lng')
    if 'bounds' in params:
        if radius is not None:
            raise MenuQueryError('bounds', 'bounds and radius_km are mutually exclusive')
        try:
            bounds = tuple(float(v) for v in params['bounds'].split(','))
        except (ValueError, AttributeError):
            raise MenuQueryError('bounds', 'expected west,south,east,north')
        if len(bounds) != 4 or not all(math.isfinite(v) for v in bounds):
            raise MenuQueryError('bounds', 'expected four finite coordinates')
        w, s, e, n = bounds
        if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
            raise MenuQueryError('bounds', 'invalid coordinate order or range')
        if e - w > MAX_BOUNDS_SPAN or n - s > MAX_BOUNDS_SPAN:
            raise MenuQueryError('bounds', 'each bounds span must be at most 2 degrees')
    return lat, lng, radius, bounds


def discover_restaurants(params, repository, profile=None):
    from .services import RESTAURANT_PARAMETERS
    allowed = RESTAURANT_PARAMETERS | {'bounds', 'personalize', 'match_only', 'judgement_status', 'view'}
    unknown = sorted(set(params) - allowed)
    if unknown:
        raise MenuQueryError(unknown[0], 'unknown parameter')
    view = params.get('view', 'full')
    if view not in {'full', 'card'}:
        raise MenuQueryError('view', 'expected full or card')
    personalize = _boolean_parameter(params, 'personalize') or False
    match_only = _boolean_parameter(params, 'match_only') or False
    judgement_status = judgement_status_parameter(params)
    if judgement_status and not personalize:
        raise MenuQueryError('personalize', 'status filtering requires personalize=true')
    if match_only and judgement_status not in {'', 'match'}:
        raise MenuQueryError('judgement_status', 'status conflicts with match_only')
    sort = params.get('sort', 'restaurant_name_asc')
    if sort not in {'dietary', 'distance_asc', 'restaurant_name_asc', 'price_asc', 'price_desc'}:
        raise MenuQueryError('sort', 'unsupported sort')
    if (match_only or sort == 'dietary') and not personalize:
        raise MenuQueryError('personalize', 'personalize=true is required')
    lat, lng, radius, bounds = parse_area(params)
    if sort == 'distance_asc' and lat is None:
        raise MenuQueryError('lat', 'distance sort requires lat and lng')
    page = _integer_parameter(params, 'page', 1, 1)
    limit = _integer_parameter(params, 'limit', 20, 1, 100)
    minimum = _integer_parameter(params, 'min_price', 0, 0)
    maximum = _integer_parameter(params, 'max_price', None, 0)
    if maximum is not None and minimum > maximum:
        raise MenuQueryError('min_price', 'min_price must not exceed max_price')
    q = _text_parameter(params, 'q', 100).casefold()
    category = _text_parameter(params, 'category', 50).casefold()
    region = _text_parameter(params, 'region', 100).casefold()
    brand = normalize_brand(_text_parameter(params, 'brand', 80))
    kind = _text_parameter(params, 'restaurant_type', 50)
    open_now = _boolean_parameter(params, 'open_now')
    from .db_repository import DatabaseCatalogRepository
    if isinstance(repository, DatabaseCatalogRepository):
        from .dietary_search import indexed_restaurants
        indexed = indexed_restaurants(params, repository, profile)
        if indexed is not None:
            return indexed
    compact = callable(getattr(type(repository), 'discovery_candidates', None))
    rows = (repository.discovery_candidates(bounds=bounds, lat=lat, lng=lng, radius=radius,
            include_hours=open_now is not None, region=region) if compact else repository.list_restaurants())
    restaurants = {}
    for raw in rows:
        r = dict(raw)
        a, b = r.get('latitude'), r.get('longitude')
        if bounds and (a is None or b is None or not (bounds[0] <= b <= bounds[2] and bounds[1] <= a <= bounds[3])):
            continue
        distance = haversine_km(lat, lng, a, b) if lat is not None and a is not None and b is not None else None
        if radius is not None and (distance is None or distance > radius):
            continue
        if region and region not in r.get('address', '').casefold():
            continue
        if brand and normalize_brand(r.get('brand', '')) != brand:
            continue
        if kind and r.get('restaurant_type') != kind:
            continue
        if open_now is not None and r.get('operating_status') not in ({'open'} if open_now else {'closed', 'break'}):
            continue
        r['distance_km'] = distance
        restaurants[r['restaurant_id']] = r
    menus = (repository.discovery_menus(list(restaurants)) if compact else repository.list_menus()) if restaurants else []
    grouped = {rid: [] for rid in restaurants}
    for m in menus:
        rid = m['restaurant_id']
        if rid not in restaurants:
            continue
        r = restaurants[rid]
        if q and not any(q in (v or '').casefold() for v in [m['menu_name'], r['restaurant_name'], r.get('address'), r.get('brand')]):
            continue
        if category and (m.get('category') or '').casefold() != category:
            continue
        price = m.get('price_amount')
        if ('min_price' in params or 'max_price' in params) and (price is None or price < minimum or (maximum is not None and price > maximum)):
            continue
        grouped[rid].append(m)
    context = None
    configured = False
    if personalize:
        from dietary.services import EvaluationContext
        context = EvaluationContext(profile)
        configured = bool(context.criteria)
        if configured:
            context.prime([m['menu_id'] for ms in grouped.values() for m in ms])
    results = []
    from dietary.services import evaluate
    order = {'match': 0, 'needs_check': 1, 'mismatch': 2}
    for rid, r in restaurants.items():
        ms = grouped[rid]
        if not ms and (q or category or 'min_price' in params or 'max_price' in params):
            continue
        summary = dict(match_menu_count=0, check_menu_count=0, mismatch_menu_count=0)
        candidates = []
        for m in ms:
            judgement = evaluate(profile, m['menu_id'], context=context) if personalize else None
            status = judgement['status'] if judgement else 'needs_check'
            key = {'match': 'match_menu_count', 'needs_check': 'check_menu_count', 'mismatch': 'mismatch_menu_count'}.get(status, 'check_menu_count')
            summary[key] += 1
            candidates.append((order.get(status, 1), m['menu_id'], m, judgement))
        if match_only and not summary['match_menu_count']:
            continue
        if judgement_status:
            candidates = [c for c in candidates if (c[3]['status'] if c[3] else 'needs_check') == judgement_status]
            if not candidates:
                continue
        representative = None
        if candidates:
            _, _, menu, judgement = min(candidates, key=lambda item: item[:2])
            representative = _serialize(menu)
            representative['judgement'] = judgement
        r.update(dietary_summary=summary, representative_menu=representative,
                 personalization={'applied': personalize, 'profile_configured': configured})
        prices = [c[2]['price_amount'] for c in candidates if c[2].get('price_amount') is not None]
        r['min_menu_price'] = min(prices) if prices else None
        results.append(r)
    if context is not None:
        context.flush()
    distance_key = lambda r: (r['distance_km'] is None, r['distance_km'] or 0, r['restaurant_id'])
    if sort == 'dietary':
        results.sort(key=lambda r: (not bool(r['dietary_summary']['match_menu_count']), *distance_key(r)))
    elif sort == 'distance_asc':
        results.sort(key=distance_key)
    elif sort in {'price_asc', 'price_desc'}:
        results.sort(key=lambda r: (r['min_menu_price'] is None, (r['min_menu_price'] or 0) * (-1 if sort == 'price_desc' else 1), r['restaurant_id']))
    else:
        results.sort(key=lambda r: (r['restaurant_name'].casefold(), r['restaurant_id']))
    total = len(results)
    selected = results[(page - 1) * limit:page * limit]
    if compact and selected:
        details = repository.restaurant_summaries([r['restaurant_id'] for r in selected])
        selected = [dict(details.get(r['restaurant_id'], {}), **r) for r in selected]
    pages = math.ceil(total / limit)
    if view == 'card':
        selected = [restaurant_card(row) for row in selected]
    return {'results': selected, 'pagination': {'page': page, 'limit': limit, 'count': len(selected),
        'total': total, 'total_pages': pages, 'next_page': page + 1 if page < pages else None,
        'previous_page': page - 1 if page > 1 and total else None}}


def restaurant_card(row):
    return {key: row.get(key) for key in ('restaurant_id', 'restaurant_name', 'address', 'latitude', 'longitude',
        'distance_km', 'dietary_summary', 'personalization')}
