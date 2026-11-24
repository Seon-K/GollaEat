"""Staff-only JSON boundary; Django admin and its permissions remain available."""
import json
from functools import wraps

from django.conf import settings
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.validators import validate_email
from django.core.exceptions import ValidationError, PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.forms import modelform_factory
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.cache import never_cache

from catalog.models import Restaurant, Menu, InformationReport
from catalog.operations import review_report, apply_report
from dietary.models import Criterion, SupportRule, Review


RESOURCES = {
    'criteria': (Criterion, ['name', 'code', 'kind', 'category', 'active'], ['name', 'code']),
    'rules': (SupportRule, ['criterion', 'excluded_tags', 'source', 'enabled'], ['criterion__name', 'source']),
    'restaurants': (Restaurant, ['name', 'address', 'phone', 'brand', 'category', 'restaurant_type'], ['name', 'address']),
    'menus': (Menu, ['name', 'description', 'price_amount', 'category', 'sale_status'], ['name', 'restaurant__name']),
    'reports': (InformationReport, ['content', 'category', 'status', 'review_notes', 'created_at', 'menu', 'restaurant', 'proposed_changes'], ['content']),
    'reviews': (Review, ['menu_id', 'body', 'created_at'], ['body', 'menu_id']),
}


def error(message, status=400):
    return JsonResponse({'message': message}, status=status)


def staff(view):
    @never_cache
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return error('관리자 로그인이 필요합니다.', 401)
        if not request.user.is_active or not request.user.is_staff:
            return error('관리자 권한이 없습니다.', 403)
        return view(request, *args, **kwargs)
    return wrapped


def identity(request):
    user = request.user
    allowed = user.is_authenticated and user.is_active and user.is_staff
    return {'authenticated': bool(allowed), 'username': user.get_username() if allowed else '',
            'permissions': sorted(user.get_all_permissions()) if allowed else [], 'csrf': get_token(request)}


@require_GET
@never_cache
def session(request):
    return JsonResponse(identity(request))


def payload(request):
    value = json.loads(request.body)
    if not isinstance(value, dict):
        raise ValueError('JSON 객체가 필요합니다.')
    return value


@require_POST
@never_cache
def sign_in(request):
    try:
        data = payload(request)
        email, password = data.get('email'), data.get('password')
        if not isinstance(email, str) or not isinstance(password, str):
            return error('이메일과 비밀번호를 입력하세요.')
        email = email.strip()
        try:
            validate_email(email)
        except ValidationError:
            return error('올바른 이메일 주소를 입력하세요.')
        # Django's default User.email is not unique. Never pick an arbitrary account.
        accounts = list(get_user_model().objects.filter(email__iexact=email)[:2])
        if len(accounts) != 1:
            return error('계정 정보 또는 관리자 권한을 확인하세요.', 401)
        user = authenticate(request, username=accounts[0].get_username(), password=password)
        if user is None or not user.is_active or not user.is_staff:
            return error('계정 정보 또는 관리자 권한을 확인하세요.', 401)
        login(request, user)
        return JsonResponse(identity(request))
    except (ValueError, UnicodeError):
        return error('요청 형식을 확인하세요.')


@require_POST
@staff
def sign_out(request):
    logout(request)
    return JsonResponse(identity(request))


def permission(user, model, action):
    return user.has_perm(f'{model._meta.app_label}.{action}_{model._meta.model_name}')


@require_GET
@staff
def dashboard(request):
    counts = {name: model.objects.count() for name, (model, _, _) in RESOURCES.items()
              if permission(request.user, model, 'view')}
    if permission(request.user, InformationReport, 'view'):
        counts['pending_reports'] = InformationReport.objects.filter(status__in=['pending', 'reviewing']).count()
    return JsonResponse({'counts': counts, 'catalog_uses_db': settings.CATALOG_USE_DB})


def serialize(obj, fields):
    result = {'id': str(obj.pk)}
    for name in fields:
        field = obj._meta.get_field(name)
        result[name] = getattr(obj, field.attname)
    if isinstance(obj, Menu):
        result['restaurant_name'] = obj.restaurant.name
    if isinstance(obj, SupportRule):
        result['criterion_name'] = obj.criterion.name
    return result


def audit(request, obj, action, message):
    LogEntry.objects.log_actions(user_id=request.user.pk, queryset=[obj],
        action_flag=action, change_message=message, single_object=True)


@staff
def records(request, resource, pk=None):
    if resource not in RESOURCES:
        return error('없는 관리 항목입니다.', 404)
    if request.method not in {'GET', 'POST', 'PATCH', 'DELETE'}:
        response = error('지원하지 않는 요청입니다.', 405)
        response['Allow'] = 'GET, POST, PATCH, DELETE'
        return response
    model, fields, search = RESOURCES[resource]
    if pk is not None:
        try:
            pk = model._meta.pk.to_python(pk)
        except (ValueError, ValidationError):
            return error('항목이 없습니다.', 404)
    action = {'GET': 'view', 'POST': 'add' if resource in {'criteria', 'rules'} and pk is None else 'change', 'PATCH': 'change', 'DELETE': 'delete'}[request.method]
    if not permission(request.user, model, action):
        return error('이 작업에 대한 권한이 없습니다.', 403)
    queryset = model.objects.all().order_by(model._meta.pk.name)
    if resource == 'menus':
        queryset = queryset.select_related('restaurant')
    if resource == 'rules':
        queryset = queryset.select_related('criterion')
    if request.method == 'GET':
        if pk is not None:
            obj = queryset.filter(pk=pk).first()
            return JsonResponse(serialize(obj, fields)) if obj else error('항목이 없습니다.', 404)
        try:
            page = int(request.GET.get('page', 1))
            if page < 1:
                raise ValueError
        except ValueError:
            return error('페이지 번호를 확인하세요.')
        query = request.GET.get('q', '').strip()[:200]
        if query:
            condition = Q()
            for field in search:
                condition |= Q(**{f'{field}__icontains': query})
            queryset = queryset.filter(condition)
        if resource == 'reports' and request.GET.get('status'):
            queryset = queryset.filter(status=request.GET['status'])
        total = queryset.count()
        return JsonResponse({'results': [serialize(o, fields) for o in queryset[(page-1)*20:page*20]], 'total': total, 'page': page})
    try:
        with transaction.atomic():
            obj = model.objects.select_for_update().filter(pk=pk).first() if pk is not None else None
            if pk is not None and obj is None:
                return error('항목이 없습니다.', 404)
            if request.method == 'DELETE':
                if resource != 'reviews' or obj is None:
                    return error('리뷰만 삭제할 수 있습니다.')
                audit(request, obj, DELETION, '관리자 리뷰 삭제')
                obj.delete()
                return JsonResponse({'deleted': True})
            data = payload(request)
            if resource == 'reports' and obj is not None and request.method == 'POST':
                if set(data) - {'action', 'review_notes'} or data.get('action') not in {'review', 'reject', 'apply', 'resolve_manual'}:
                    return error('제보 처리 요청을 확인하세요.')
                if not isinstance(data.get('review_notes'), str) or len(data['review_notes']) > 5000:
                    return error('검토 메모를 입력하세요.')
                obj.review_notes = data['review_notes'].strip()
                obj.save(update_fields=['review_notes'])
                obj = apply_report(obj.pk, request.user) if data['action'] == 'apply' else review_report(obj.pk, request.user, data['action'])
                return JsonResponse(serialize(obj, fields))
            if resource in {'reports', 'reviews'}:
                return error('지원하지 않는 수정입니다.')
            creating = request.method == 'POST' and pk is None and resource in {'criteria', 'rules'}
            if not creating and (request.method != 'PATCH' or obj is None):
                return error('등록은 기준 정보와 판단 규칙에서만 지원합니다.')
            if not data or set(data) - set(fields):
                return error('수정할 필드를 확인하세요.')
            # Codes and kinds have existing profile/rule references; keep them stable.
            if not creating and resource == 'criteria' and set(data) & {'code', 'kind'}:
                return error('등록된 코드와 유형은 변경할 수 없습니다.')
            if not creating and resource == 'rules' and 'criterion' in data:
                return error('판단 규칙의 연결 기준은 변경할 수 없습니다.')
            edit_fields = fields if creating else list(data)
            for key in edit_fields:
                value = data.get(key)
                field = model._meta.get_field(key)
                if field.get_internal_type() == 'BooleanField' and not isinstance(value, bool):
                    return error('활성 여부는 참/거짓이어야 합니다.')
                if key == 'price_amount' and value is not None and (not isinstance(value, int) or isinstance(value, bool)):
                    return error('가격은 정수 또는 미확인 값이어야 합니다.')
            form = modelform_factory(model, fields=edit_fields)(data=data, instance=obj)
            if not form.is_valid():
                return error(' / '.join(f'{key}: {", ".join(values)}' for key, values in form.errors.items()))
            obj = form.save()
            audit(request, obj, ADDITION if creating else CHANGE, '관리 페이지: ' + ', '.join(edit_fields))
            return JsonResponse(serialize(obj, fields), status=201 if creating else 200)
    except (ValueError, TypeError, UnicodeError, ValidationError) as exc:
        return error('; '.join(exc.messages) if isinstance(exc, ValidationError) else '요청 값의 형식을 확인하세요.')
    except PermissionDenied:
        return error('대상 정보 수정 권한이 없습니다.', 403)
