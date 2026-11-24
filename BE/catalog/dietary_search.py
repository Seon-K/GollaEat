"""Thin SQL search against derived statuses; hydrate evidence for the page only."""
import math
from django.db import connection
from django.db.models import (Q, F, Value, IntegerField, FloatField, OuterRef, Subquery, Max,
                              Count, Min, Case, When, Exists, Window, JSONField)
from django.db.models.functions import (Coalesce, Collate, Radians, Sin, Cos, ASin, Sqrt, Least, Greatest, JSONObject)
from dietary.services import EvaluationContext, evaluate, PRIORITY
from .models import Menu, Restaurant, MenuDietaryStatus, MenuDietaryState
from .query_expressions import UnicodeCasefold
from .dietary_index import available, ensure_ready, ready_condition, SEPARATOR


def distance_expression(latitude, longitude, lat, lng):
    a, b = Radians(F(latitude)), Value(math.radians(lat))
    d = Sin((a - b) / 2.0) ** 2 + Cos(a) * Cos(b) * Sin((Radians(F(longitude)) - Value(math.radians(lng))) / 2.0) ** 2
    return Value(12742.0176) * ASin(Sqrt(Least(Value(1.0), Greatest(Value(0.0), d))))


def location(qs, params, latitude, longitude):
    if 'bounds' in params:
        w, s, e, n = map(float, params['bounds'].split(','))
        qs = qs.filter(**{latitude + '__range': (s, n), longitude + '__range': (w, e)})
    if 'lat' in params:
        qs = qs.annotate(_distance=Case(When(**{latitude + '__isnull': False, longitude + '__isnull': False},
            then=distance_expression(latitude, longitude, float(params['lat']), float(params['lng']))), default=Value(None), output_field=FloatField()))
        if 'radius_km' in params:
            qs = qs.filter(_distance__lte=float(params['radius_km']))
    else:
        qs = qs.annotate(_distance=Value(None, output_field=FloatField()))
    return qs


def region_filter(qs, field, value):
    needle = value.strip().casefold()
    # Hangul has no case mapping: avoid constructing a full Unicode mapping
    # for the app's Asan-only lookup, without weakening other region searches.
    if needle and all('\uac00' <= char <= '\ud7a3' for char in needle):
        return qs.filter(**{field + '__contains': needle})
    return qs.alias(_address=UnicodeCasefold(field)).filter(_address__contains=needle)


def native_menus(params, restaurant_search=False):
    qs = Menu.objects.all()
    if params.get('restaurant_id', '').strip():
        qs = qs.filter(restaurant_id=params['restaurant_id'].strip())
    if params.get('region'):
        qs = region_filter(qs, 'restaurant__address', params['region'])
    if params.get('restaurant_type', '').strip():
        qs = qs.filter(restaurant__restaurant_type=params['restaurant_type'].strip())
    if 'min_price' in params or 'max_price' in params:
        qs = qs.filter(price_amount__gte=int(params.get('min_price', 0)))
        if 'max_price' in params:
            qs = qs.filter(price_amount__lte=int(params['max_price']))
    elif not restaurant_search:
        qs = qs.filter(Q(price_amount__isnull=True) | Q(price_amount__gte=0))
    return location(qs, params, 'restaurant__latitude', 'restaurant__longitude')


def documents(qs, params, restaurant_search=False):
    from .services import _menu_categories
    categories = ({params.get('category', '').strip().casefold()} - {''}) if restaurant_search else _menu_categories(params)
    if categories:
        qs = qs.filter(dietary_state__category_key__in=categories)
    text = params.get('q', '').strip().casefold()
    if text:
        condition = Q(dietary_state__search_text__contains=text)
        if restaurant_search:
            qs = qs.alias(_address=UnicodeCasefold('restaurant__address'), _menu=UnicodeCasefold('name'),
                _store=UnicodeCasefold('restaurant__name'), _brand=UnicodeCasefold('restaurant__brand'))
            condition = Q(_address__contains=text) | Q(_menu__contains=text) | Q(_store__contains=text) | Q(_brand__contains=text)
        qs = qs.filter(condition)
    return qs


def ranks(qs, context):
    ids = [criterion.pk for criterion in context.criteria] if context is not None else []
    if not ids:
        return qs.annotate(_rank=Value(0 if context is not None else 1, output_field=IntegerField()))
    statuses = MenuDietaryStatus.objects.filter(menu_id=OuterRef('pk'), criterion_id__in=ids,
        menu_revision=OuterRef('dietary_state__revision')).order_by()
    if len(ids) == 1:
        # The unique menu/criterion key already identifies the combined rank.
        # Avoid a GROUP BY/COUNT aggregate for every candidate in home discovery.
        statuses = statuses.values('rank')[:1]
    else:
        statuses = statuses.values('menu_id').annotate(
            maximum=Max('rank'), conditions=Count('criterion_id')).annotate(combined=Case(
                When(maximum=2, then=Value(2)), When(conditions=len(ids), then=F('maximum')),
                default=Value(1), output_field=IntegerField())).values('combined')[:1]
    return qs.annotate(_rank=Case(When(ready_condition('dietary_state__'),
        then=Coalesce(Subquery(statuses), Value(1))), default=Value(1), output_field=IntegerField()))


def pagination(page, limit, count, total):
    pages = (total + limit - 1) // limit
    return {'page': page, 'limit': limit, 'count': count, 'total': total, 'total_pages': pages,
            'next_page': page + 1 if page < pages else None, 'previous_page': page - 1 if page > 1 and total else None}


def supported(params):
    return ('open_now' not in params and not params.get('brand') and
            '\x00' not in ''.join(str(v) for v in params.values()) and SEPARATOR not in params.get('q', ''))


def hydrated_judgements(context, states):
    if context is None:
        return {}
    context.component_data.update({mid: state.evaluation_data for mid, state in states.items()})
    result = {mid: evaluate(None, mid, context=context) for mid in states}
    return result


def snapshots_current(states):
    if not states:
        return True
    current = dict(MenuDietaryState.objects.filter(ready_condition(), menu_id__in=states).values_list('menu_id', 'revision'))
    return all(current.get(mid) == state.revision and state.evaluation_data is not None for mid, state in states.items())


def indexed_menus(params, repository, profile):
    from .services import _serialize
    if not available() or not supported(params):
        return None
    sort = params.get('sort', 'menu_name_asc')
    status = params.get('judgement_status')
    if profile is None and (sort == 'dietary' or status):
        return None
    native = native_menus(params)
    if not ensure_ready(native):
        return None
    context = EvaluationContext(profile) if profile is not None else None
    qs = ranks(documents(native, params), context)
    if status:
        qs = qs.filter(_rank=PRIORITY[status])
    collation = 'C' if connection.vendor == 'postgresql' else 'BINARY'
    tie = Collate('pk', collation)
    order = {'dietary': ['_rank', tie], 'menu_name_asc': [Collate('dietary_state__name_key', collation), tie],
        'price_asc': [F('price_amount').asc(nulls_last=True), tie],
        'price_desc': [F('price_amount').desc(nulls_last=True), tie],
        'distance_asc': [F('_distance').asc(nulls_last=True), tie]}[sort]
    menu_query = params.get('menu_query', '').strip().casefold()
    if menu_query:
        qs = qs.annotate(_menu_relevance=Case(
            When(dietary_state__name_key=menu_query, then=Value(0)),
            When(dietary_state__name_key__contains=menu_query, then=Value(1)),
            default=Value(2), output_field=IntegerField()))
        order = ['_menu_relevance', *order]
    page, limit = int(params.get('page', 1)), int(params.get('limit', 20))
    rows = list(qs.annotate(_total=Window(Count('pk'))).select_related('restaurant', 'dietary_state').defer('restaurant__data').order_by(*order)[(page-1)*limit:page*limit])
    total = rows[0]._total if rows else qs.count()
    states = {row.pk: row.dietary_state for row in rows}
    if not snapshots_current(states):
        return None
    judgements = hydrated_judgements(context, states)
    # Defend against an evidence change between index selection and page hydration.
    if context is not None and context.criteria:
        changed = [row.pk for row in rows if PRIORITY[judgements[row.pk]['status']] != row._rank]
        if changed:
            MenuDietaryState.objects.filter(menu_id__in=changed).update(dirty=True, revision=F('revision') + 1)
            return None
    results = []
    for row in rows:
        menu = _serialize(dict(repository._menu(row), distance_km=row._distance))
        if row.pk in judgements:
            menu['judgement'] = judgements[row.pk]
        results.append(menu)
    return {'results': results, 'pagination': pagination(page, limit, len(results), total)}


def indexed_restaurants(params, repository, profile):
    from .services import _serialize
    if not available() or not supported(params):
        return None
    context = EvaluationContext(profile) if params.get('personalize') == 'true' else None
    native = native_menus(params, restaurant_search=True)
    # A first-time visitor without dietary conditions needs only current menu
    # counts/prices. Do not rebuild dietary evidence for a plain card request.
    plain_card = (params.get('view') == 'card' and not (context and context.criteria)
                  and not any(params.get(key, '').strip() for key in ('q', 'category')))
    if not plain_card and not ensure_ready(native):
        return None
    menus = ranks(documents(native, params, restaurant_search=True), context)
    aggregate = menus.order_by().values('restaurant_id').annotate(summary=JSONObject(
        match_menu_count=Count('pk', filter=Q(_rank=0)), check_menu_count=Count('pk', filter=Q(_rank=1)),
        mismatch_menu_count=Count('pk', filter=Q(_rank=2))))
    target = params.get('judgement_status') or ('match' if params.get('match_only') == 'true' else None)
    eligible = menus.filter(_rank=PRIORITY[target]) if target else menus
    representatives = eligible.filter(restaurant_id=OuterRef('pk')).order_by('_rank', 'pk')
    minimum = eligible.order_by().values('restaurant_id').annotate(price=Min('price_amount')).filter(restaurant_id=OuterRef('pk')).values('price')[:1]
    stores = Restaurant.objects.all()
    if params.get('region'):
        stores = region_filter(stores, 'address', params['region'])
    if params.get('restaurant_type', '').strip():
        stores = stores.filter(restaurant_type=params['restaurant_type'].strip())
    stores = location(stores, params, 'latitude', 'longitude')
    if target or any(params.get(key, '').strip() for key in ('q', 'category')) or 'min_price' in params or 'max_price' in params:
        stores = stores.filter(Exists(eligible.filter(restaurant_id=OuterRef('pk'))))
    stores = stores.annotate(
        _summary=Coalesce(Subquery(aggregate.filter(restaurant_id=OuterRef('pk')).values('summary')[:1]),
            Value({'match_menu_count': 0, 'check_menu_count': 0, 'mismatch_menu_count': 0}, output_field=JSONField())),
        _minimum=Subquery(minimum), _representative=Subquery(representatives.values('pk')[:1]),
        _representative_rank=Subquery(representatives.values('_rank')[:1]))
    collation = 'C' if connection.vendor == 'postgresql' else 'BINARY'
    tie = Collate('pk', collation)
    sort = params.get('sort', 'restaurant_name_asc')
    if sort == 'dietary':
        stores = stores.annotate(_priority=Case(When(Exists(menus.filter(restaurant_id=OuterRef('pk'), _rank=0)), then=Value(0)), default=Value(1)))
        order = ['_priority', F('_distance').asc(nulls_last=True), tie]
    elif sort == 'distance_asc':
        order = [F('_distance').asc(nulls_last=True), tie]
    elif sort in {'price_asc', 'price_desc'}:
        order = [F('_minimum').asc(nulls_last=True) if sort == 'price_asc' else F('_minimum').desc(nulls_last=True), tie]
    else:
        order = [Collate(UnicodeCasefold('name'), collation), tie]
    page, limit = int(params.get('page', 1)), int(params.get('limit', 20))
    if params.get('view') == 'card':
        fields = ('pk', 'name', 'address', 'latitude', 'longitude', '_distance', '_summary', '_total')
        cards = list(stores.annotate(_total=Window(Count('pk'))).order_by(*order).values(*fields)[(page-1)*limit:page*limit])
        total = cards[0]['_total'] if cards else stores.count()
        results = [dict(restaurant_id=row['pk'], restaurant_name=row['name'], address=row['address'],
            latitude=row['latitude'], longitude=row['longitude'], distance_km=row['_distance'], dietary_summary=row['_summary'],
            personalization={'applied': context is not None, 'profile_configured': bool(context and context.criteria)}) for row in cards]
        return {'results': results, 'pagination': pagination(page, limit, len(results), total)}
    rows = list(stores.annotate(_total=Window(Count('pk'))).order_by(*order).values(
        'pk', '_distance', '_summary', '_minimum', '_representative', '_representative_rank', '_total')[(page-1)*limit:page*limit])
    total = rows[0]['_total'] if rows else stores.count()
    details = repository.restaurant_summaries([r['pk'] for r in rows]) if rows else {}
    ids = [r['_representative'] for r in rows if r['_representative']]
    # Fetch compact representative fields and evaluator snapshot in one page-sized read.
    selected_menus = list(Menu.objects.filter(ready_condition('dietary_state__'),
        dietary_state__evaluation_data__isnull=False, pk__in=ids).select_related('restaurant', 'dietary_state').defer(
        'data', 'description', 'restaurant__data')) if ids else []
    summaries = {menu.pk: dict(menu_id=menu.pk, menu_name=menu.name, restaurant_id=menu.restaurant_id,
        restaurant_name=menu.restaurant.name, brand=menu.restaurant.brand, category=menu.category or menu.restaurant.category,
        price_amount=menu.price_amount, price_raw=str(menu.price_amount) if menu.price_amount is not None else None,
        price_status='fixed' if menu.price_amount is not None else 'unknown', branch_sale_status=menu.sale_status)
        for menu in selected_menus}
    states = {menu.pk: menu.dietary_state for menu in selected_menus}
    if len(states) != len(set(ids)):
        return None
    judgements = hydrated_judgements(context, states)
    if context is not None and context.criteria:
        changed = [row['_representative'] for row in rows if row['_representative'] and
                   PRIORITY[judgements[row['_representative']]['status']] != row['_representative_rank']]
        if changed:
            MenuDietaryState.objects.filter(menu_id__in=changed).update(dirty=True, revision=F('revision') + 1)
            return None
    results = []
    for row in rows:
        representative = _serialize(summaries[row['_representative']]) if row['_representative'] in summaries else None
        if representative is not None:
            # Preserve the compact map representative contract.
            for key in ('description', 'menu_option', 'restaurant_type', 'collected_at', 'updated_at', 'source_price_status'):
                representative.pop(key, None)
            representative['restaurant']['latitude'] = None
            representative['restaurant']['longitude'] = None
            amount = representative['price']['amount']
            representative['price']['raw'] = str(amount) if amount is not None else None
            representative['judgement'] = judgements.get(row['_representative'])
        results.append(dict(details[row['pk']], distance_km=row['_distance'], min_menu_price=row['_minimum'],
            dietary_summary=row['_summary'],
            representative_menu=representative, personalization={'applied': context is not None, 'profile_configured': bool(context and context.criteria)}))
    return {'results': results, 'pagination': pagination(page, limit, len(results), total)}
