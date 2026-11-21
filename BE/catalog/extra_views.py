import json
import uuid

from django.core.exceptions import ValidationError, PermissionDenied
from django.http import JsonResponse

from .models import InformationReport, Menu, Restaurant, GeocodeAttempt
from .operations import component_json
from .services import _integer_parameter, MenuQueryError


def _error(message, status=400):
    return JsonResponse({'error': {'code': 'invalid_request' if status == 400 else 'not_found', 'message': message}}, status=status)


def _method(methods):
    response = JsonResponse({'error': {'code': 'method_not_allowed'}}, status=405)
    response['Allow'] = ', '.join(methods)
    return response


def _payload(request):
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeError):
        raise ValueError('유효한 JSON 객체가 필요합니다.')
    if not isinstance(data, dict):
        raise ValueError('JSON 객체가 필요합니다.')
    return data


def _owned_reports(request):
    if request.user.is_authenticated:
        return InformationReport.objects.filter(user=request.user)
    token = request.session.get('catalog_report_owner')
    return InformationReport.objects.filter(owner_token=token, user__isnull=True) if token else InformationReport.objects.none()


def report_json(item):
    return {'report_id': item.pk, 'restaurant_id': item.restaurant_id, 'menu_id': item.menu_id,
        'category': item.category, 'content': item.content, 'proposed_changes': item.proposed_changes,
        'status': item.status, 'created_at': item.created_at, 'reviewed_at': item.reviewed_at}


def reports(request):
    if request.method == 'GET':
        try:
            if set(request.GET) - {'page', 'limit'}:
                raise ValueError('지원하지 않는 파라미터입니다.')
            page = _integer_parameter(request.GET, 'page', 1, 1)
            limit = _integer_parameter(request.GET, 'limit', 20, 1, 100)
        except (ValueError, MenuQueryError) as exc:
            return _error(str(exc))
        items = _owned_reports(request).order_by('-created_at', '-pk')
        total = items.count()
        return JsonResponse({'results': [report_json(r) for r in items[(page - 1) * limit:page * limit]],
            'pagination': {'page': page, 'limit': limit, 'total': total}})
    if request.method != 'POST':
        return _method(['GET', 'POST'])
    try:
        data = _payload(request)
        if set(data) - {'menu_id', 'restaurant_id', 'category', 'content', 'proposed_changes'}:
            raise ValueError('허용되지 않은 필드입니다.')
        content = data.get('content')
        if not isinstance(content, str) or not 1 <= len(content.strip()) <= 5000:
            raise ValueError('내용은 1~5000자여야 합니다.')
        rid, mid = data.get('restaurant_id'), data.get('menu_id')
        for value in (rid, mid):
            if value is not None and (not isinstance(value, str) or not 1 <= len(value) <= 100):
                raise ValueError('ID는 1~100자 문자열이어야 합니다.')
        if rid is None and mid is None:
            raise ValueError('매장 또는 메뉴 ID가 필요합니다.')
        restaurant = Restaurant.objects.filter(pk=rid).first() if rid is not None else None
        menu = Menu.objects.filter(pk=mid).first() if mid is not None else None
        if (rid is not None and restaurant is None) or (mid is not None and menu is None):
            return _error('매장 또는 메뉴가 없습니다.', 404)
        token = request.session.get('catalog_report_owner') or str(uuid.uuid4())
        item = InformationReport(restaurant=restaurant, menu=menu, owner_token=token,
            user=request.user if request.user.is_authenticated else None,
            category=data.get('category'), content=content.strip(), proposed_changes=data.get('proposed_changes', {}))
        item.full_clean()
        item.save()
        request.session['catalog_report_owner'] = token
        return JsonResponse(report_json(item), status=201)
    except (ValueError, TypeError, ValidationError) as exc:
        return _error('; '.join(exc.messages) if isinstance(exc, ValidationError) else str(exc))


def report_detail(request, report_id):
    if request.method != 'GET':
        return _method(['GET'])
    item = _owned_reports(request).filter(pk=report_id).first()
    return JsonResponse(report_json(item)) if item else _error('제보가 없습니다.', 404)


def option_check(request, menu_id):
    if request.method != 'POST':
        return _method(['POST'])
    menu = Menu.objects.filter(pk=menu_id).first()
    if menu is None:
        return _error('메뉴가 없습니다.', 404)
    try:
        data = _payload(request)
        ids = data.get('component_ids')
        if set(data) != {'component_ids'} or not isinstance(ids, list) or len(ids) > 100 or any(
                not isinstance(v, str) or not v.startswith('component:') or len(v) > 100 for v in ids):
            raise ValueError('component_ids 문자열 목록이 필요합니다.')
        if len(ids) != len(set(ids)):
            raise ValueError('중복된 구성품입니다.')
        options = {('component:' + str(c.pk)): c for c in menu.components.select_related('source').prefetch_related('declarations__source')}
        if set(ids) - options.keys():
            raise ValueError('이 메뉴에 속하지 않는 구성품입니다.')
        selected = {key: c for key, c in options.items() if c.is_default or key in ids}
        problems = []
        for group in menu.option_groups.all():
            count = sum(c.group_id == group.pk for c in selected.values())
            if not group.min_select <= count <= group.max_select:
                problems.append({'group_id': group.pk, 'min_select': group.min_select,
                    'max_select': group.max_select, 'selected_count': count})
        known = bool(options or menu.option_groups.exists())
        return JsonResponse({'menu_id': menu_id, 'valid': (not problems) if known else None,
            'option_data_status': 'provided' if known else 'unknown', 'problems': problems,
            'components': [component_json(c) for c in selected.values()],
            'dietary_status': 'not_determined'})
    except (ValueError, TypeError) as exc:
        return _error(str(exc))


def geocode_restaurant(request, restaurant_id):
    from .geocoding import _authorize, propose_coordinates, attempt_json
    try:
        _authorize(request.user)
    except PermissionDenied:
        return JsonResponse({'error': {'code': 'permission_denied'}}, status=403)
    if request.method != 'POST':
        return _method(['POST'])
    restaurant = Restaurant.objects.filter(pk=restaurant_id).first()
    if restaurant is None:
        return _error('매장이 없습니다.', 404)
    try:
        data = _payload(request)
        if set(data) - {'mode'}:
            raise ValueError('mode만 지정할 수 있습니다.')
        attempt = propose_coordinates(restaurant, request.user, data.get('mode', 'address'))
        return JsonResponse(attempt_json(attempt))
    except (ValueError, TypeError, ValidationError) as exc:
        return _error('; '.join(exc.messages) if isinstance(exc, ValidationError) else str(exc))


def geocode_apply(request, attempt_id):
    from .geocoding import _authorize, apply_coordinates, attempt_json
    try:
        _authorize(request.user)
    except PermissionDenied:
        return JsonResponse({'error': {'code': 'permission_denied'}}, status=403)
    if request.method != 'POST':
        return _method(['POST'])
    try:
        if _payload(request):
            raise ValueError('추가 필드 없이 빈 JSON 객체를 전달하세요.')
        return JsonResponse(attempt_json(apply_coordinates(attempt_id, request.user)))
    except GeocodeAttempt.DoesNotExist:
        return _error('좌표 변환 기록이 없습니다.', 404)
    except (ValueError, ValidationError) as exc:
        return _error('; '.join(exc.messages) if isinstance(exc, ValidationError) else str(exc))
