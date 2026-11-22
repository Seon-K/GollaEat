from django.conf import settings
from django.http import JsonResponse

from .repository import CatalogDataError, CsvCatalogRepository
from .services import MenuQueryError, get_restaurant_detail, list_menus, list_restaurants
from .services import list_restaurant_menus
from .services import serialize_menu_detail


def _personalized(request, result):
    from dietary.views import owner
    from dietary.models import Favorite
    from dietary.services import evaluate
    profile = owner(request)
    saved = set(Favorite.objects.filter(profile=profile).values_list('menu_id', flat=True))
    for menu in result['results']:
        menu['saved'] = menu['menu_id'] in saved
        menu['judgement'] = evaluate(profile, menu['menu_id'])
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


def menus(request):
    if request.method != 'GET':
        return _method_not_allowed()

    try:
        params = request.GET.copy()
        personalize = params.get('personalize', 'false')
        if personalize not in {'true', 'false'}:
            raise MenuQueryError('personalize', 'personalize must be true or false')
        params.pop('personalize', None)
        result = list_menus(params, _csv_repository())
        return JsonResponse(_personalized(request, result) if personalize == 'true' else result)
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
    try:
        result = serialize_menu_detail(_csv_repository().get_menu(menu_id))
    except CatalogDataError as exc:
        return _catalog_unavailable(exc)
    if result is None:
        return JsonResponse(
            {'error': {'code': 'menu_not_found', 'message': 'menu not found'}}, status=404,
        )
    result.setdefault('analysis_reference', None)
    return JsonResponse(result)


def restaurants(request):
    if request.method != 'GET':
        return _method_not_allowed()
    try:
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

