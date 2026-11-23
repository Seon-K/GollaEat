from django.conf import settings
from django.http import JsonResponse

from .repository import CatalogDataError, CsvCatalogRepository
from .services import MenuQueryError, get_restaurant_detail, list_menus, list_restaurants
from .services import list_restaurant_menus
from .services import serialize_menu_detail
from .categories import MENU_CATEGORIES


def _personalized(request, result, profile=None):
    from dietary.views import owner
    from dietary.models import Favorite
    from dietary.services import EvaluationContext, evaluate
    profile = profile if profile is not None else owner(request)
    missing = [menu['menu_id'] for menu in result['results'] if 'judgement' not in menu]
    context = EvaluationContext(profile) if missing else None
    if context is not None:
        context.prime(missing)
    page_ids = [menu['menu_id'] for menu in result['results']]
    saved = set(Favorite.objects.filter(profile=profile, menu_id__in=page_ids).values_list('menu_id', flat=True))
    for menu in result['results']:
        menu['saved'] = menu['menu_id'] in saved
        if 'judgement' not in menu:
            menu['judgement'] = evaluate(profile, menu['menu_id'], context=context)
    if context is not None:
        context.flush()
    return result


def _csv_repository():
    from .final_repository import get_repository
    return get_repository()


def _method_not_allowed():
    response = JsonResponse(
        {'error': {'code': 'method_not_allowed', 'message': 'GET method required'}},
        status=405,
    )
    response['Allow'] = 'GET'
    return response


def _catalog_unavailable(exc):
    return JsonResponse(
        {'error': {'code': 'catalog_unavailable', 'message': str(exc)}},
        status=503,
    )


def menu_categories(request):
    if request.method != 'GET':
        return _method_not_allowed()
    return JsonResponse({'categories': list(MENU_CATEGORIES)})


def menus(request):
    if request.method != 'GET':
        return _method_not_allowed()

    try:
        params = request.GET.copy()
        personalize = params.get('personalize', 'false')
        if personalize not in {'true', 'false'}:
            raise MenuQueryError('personalize', 'personalize must be true or false')
        params.pop('personalize', None)
        profile = None
        if personalize == 'true' or params.get('sort') == 'dietary' or params.get('judgement_status'):
            from dietary.views import owner
            profile = owner(request)
        result = list_menus(params, _csv_repository(), profile=profile)
        return JsonResponse(_personalized(request, result, profile) if personalize == 'true' else result)
    except CatalogDataError as exc:
        return _catalog_unavailable(exc)
    except MenuQueryError as exc:
        return JsonResponse(
            {
                'error': {
                    'code': 'invalid_query_parameter',
                    'parameter': exc.parameter,
                    'message': str(exc),
                }
            },
            status=400,
        )


def menu_detail(request, menu_id):
    if request.method != 'GET':
        return _method_not_allowed()
    personalize = request.GET.get('personalize', 'false')
    if personalize not in {'true', 'false'}:
        return JsonResponse({'error': {'code': 'invalid_query_parameter', 'parameter': 'personalize',
                                      'message': 'personalize must be true or false'}}, status=400)
    try:
        result = serialize_menu_detail(_csv_repository().get_menu(menu_id))
    except CatalogDataError as exc:
        return _catalog_unavailable(exc)
    if result is None:
        return JsonResponse(
            {'error': {'code': 'menu_not_found', 'message': 'menu not found'}}, status=404,
        )
    result.setdefault('analysis_reference', None)
    if personalize == 'true':
        _personalized(request, {'results': [result]})
    return JsonResponse(result)


def restaurants(request):
    if request.method != 'GET':
        return _method_not_allowed()
    try:
        if any(key in request.GET for key in ('personalize', 'match_only', 'bounds', 'judgement_status', 'view')) or request.GET.get('sort') == 'dietary':
            from .discovery import discover_restaurants
            from dietary.views import owner
            profile = owner(request) if request.GET.get('personalize') == 'true' else None
            return JsonResponse(discover_restaurants(request.GET, _csv_repository(), profile))
        return JsonResponse(list_restaurants(request.GET, _csv_repository()))
    except MenuQueryError as exc:
        return JsonResponse(
            {
                'error': {
                    'code': 'invalid_query_parameter',
                    'parameter': exc.parameter,
                    'message': str(exc),
                }
            },
            status=400,
        )
    except CatalogDataError as exc:
        return _catalog_unavailable(exc)


def restaurant_detail(request, restaurant_id):
    if request.method != 'GET':
        return _method_not_allowed()
    try:
        result = get_restaurant_detail(restaurant_id, _csv_repository())
    except CatalogDataError as exc:
        return _catalog_unavailable(exc)
    if result is None:
        return JsonResponse(
            {'error': {'code': 'restaurant_not_found', 'message': 'restaurant not found'}},
            status=404,
        )
    return JsonResponse(result)


def restaurant_menus(request, restaurant_id):
    if request.method != 'GET':
        return _method_not_allowed()
    try:
        result = list_restaurant_menus(restaurant_id, request.GET, _csv_repository())
    except MenuQueryError as exc:
        return JsonResponse({'error': {'code': 'invalid_query_parameter',
                             'parameter': exc.parameter, 'message': str(exc)}}, status=400)
    except CatalogDataError as exc:
        return _catalog_unavailable(exc)
    if result is None:
        return JsonResponse({'error': {'code': 'restaurant_not_found',
                             'message': 'restaurant not found'}}, status=404)
    return JsonResponse(result)

