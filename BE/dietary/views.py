import json
import uuid
from functools import wraps

from django.db import connection, transaction
from django.db.models import BooleanField
from django.db.models.expressions import RawSQL
from django.http import JsonResponse
from django.middleware.csrf import get_token

from .models import Criterion, Favorite, Profile, Review
from .services import check_order, communication, evaluate, rank_menus
from .validation import identifiers as ids, order_components
from .pagination import page_parameters, paginate


def endpoint(methods):
    def decorate(fn):
        @wraps(fn)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                response = JsonResponse({'error': 'method_not_allowed'}, status=405)
                response['Allow'] = ', '.join(methods)
                return response
            try:
                request.payload = json.loads(request.body) if request.body else {}
                if not isinstance(request.payload, dict):
                    raise ValueError('JSON object required')
                return fn(request, *args, **kwargs)
            except (ValueError, TypeError, KeyError) as exc:
                return JsonResponse({'error': str(exc)}, status=400)
        return wrapped
    return decorate


def owner(request):
    if 'dietary_owner' not in request.session:
        request.session['dietary_owner'] = str(uuid.uuid4())
    return Profile.objects.get_or_create(guest_id=request.session['dietary_owner'])[0]


def components(payload):
    return order_components(payload['components'])


@endpoint(['GET'])
def session(request):
    owner(request)
    return JsonResponse({'csrf_token': get_token(request), 'identity': 'guest_session'})


@endpoint(['GET'])
def allergens(request):
    return JsonResponse({'allergens': list(Criterion.objects.filter(kind='allergen', active=True).order_by('pk').values_list('name', flat=True))})


@endpoint(['GET'])
def restricted(request):
    categories = {}
    for c in Criterion.objects.filter(kind='ingredient', active=True).order_by('pk'):
        categories.setdefault(c.category, []).append(c.name)
    return JsonResponse({'categories': [{'name': k, 'items': v} for k, v in categories.items()]})


@endpoint(['GET'])
def criteria(request):
    return JsonResponse({'criteria': list(Criterion.objects.filter(active=True).values('code', 'name', 'kind', 'category'))})


@endpoint(['GET', 'PUT', 'PATCH'])
def profile(request):
    p = owner(request)
    if request.method != 'GET':
        codes = ids(request.payload['criteria'])
        selected = list(Criterion.objects.filter(code__in=codes, active=True))
        if len(selected) != len(set(codes)):
            raise ValueError('Unknown or inactive criterion')
        for c in selected:
            if c.kind != 'preference' and not hasattr(c, 'rule'):
                raise ValueError('Unsupported criterion: ' + c.code)
            if c.kind != 'preference' and (not c.rule.enabled or not c.rule.excluded_tags or not c.rule.source):
                raise ValueError('Unsupported criterion: ' + c.code)
        with transaction.atomic():
            p.criteria.set(selected)
            p.save()
    return JsonResponse({'criteria': list(p.criteria.values_list('code', flat=True))})


@endpoint(['POST'])
def judgement(request):
    mid = ids([request.payload['menu_id']])[0]
    return JsonResponse(evaluate(owner(request), mid))


@endpoint(['POST'])
def ranking(request):
    return JsonResponse({'results': rank_menus(owner(request), ids(request.payload['menu_ids']))})


@endpoint(['POST'])
def order(request):
    return JsonResponse(check_order(owner(request), components(request.payload)))


@endpoint(['POST'])
def message(request):
    return JsonResponse(communication(owner(request), components(request.payload)))


@endpoint(['GET', 'POST'])
def favorites(request):
    p = owner(request)
    if request.method == 'POST':
        mid = ids([request.payload['menu_id']])[0]
        item, created = Favorite.objects.get_or_create(profile=p, menu_id=mid)
        return JsonResponse({'id': item.pk, 'menu_id': mid}, status=201 if created else 200)
    page, limit = page_parameters(request.GET)
    selected, pagination = paginate(Favorite.objects.filter(profile=p).order_by('-created_at', '-pk'), page, limit)
    return JsonResponse({'favorites': [{'id': f.pk, 'menu_id': f.menu_id, 'judgement': evaluate(p, f.menu_id)} for f in selected],
                         'pagination': pagination})


@endpoint(['DELETE'])
def favorite_detail(request, pk):
    count, _ = Favorite.objects.filter(pk=pk, profile=owner(request)).delete()
    return JsonResponse({'deleted': bool(count)}, status=200 if count else 404)


def review_json(r, guest_id=None):
    return {'id': r.pk, 'menu_id': r.menu_id, 'body': r.body, 'is_mine': bool(guest_id and str(r.profile.guest_id) == guest_id), 'disclosed_conditions': r.disclosed_conditions,
            'created_at': r.created_at.isoformat(), 'updated_at': r.updated_at.isoformat()}


def review_body(payload):
    body = payload['body']
    if not isinstance(body, str) or not body.strip() or len(body) > 5000:
        raise ValueError('body must contain 1–5000 characters')
    return body.strip()


@endpoint(['GET', 'POST'])
def reviews(request):
    if request.method == 'POST':
        p = owner(request)
        codes = ids(request.payload.get('disclose_conditions', []))
        selected = list(p.criteria.exclude(kind='preference').filter(code__in=codes))
        if len(selected) != len(set(codes)):
            raise ValueError('Disclosure must be a subset of your current restrictions')
        r = Review.objects.create(profile=p, menu_id=ids([request.payload['menu_id']])[0], body=review_body(request.payload),
                                  disclosed_conditions=[{'code': c.code, 'name': c.name, 'kind': c.kind} for c in selected])
        return JsonResponse(review_json(r, request.session.get('dietary_owner')), status=201)
    mine = request.GET.get('mine', 'false')
    if mine not in ['true', 'false']:
        raise ValueError('mine must be true or false')
    qs = Review.objects.select_related('profile').order_by('-created_at', '-pk')
    guest_id = request.session.get('dietary_owner')
    if mine == 'true':
        qs = qs.filter(profile__guest_id=guest_id) if guest_id else qs.none()
    if request.GET.get('menu_id'):
        qs = qs.filter(menu_id=request.GET['menu_id'])
    conditions = ids(request.GET.getlist('condition'))
    page, limit = page_parameters(request.GET)
    for index, code in enumerate(set(conditions)):
        if connection.vendor == 'postgresql':
            qs = qs.filter(disclosed_conditions__contains=[{'code': code}])
        else:
            # Parameterized EXISTS keeps SQLite JSON snapshot filtering in the DB.
            alias = f'condition_match_{index}'
            expression = RawSQL(
                "EXISTS (SELECT 1 FROM json_each(dietary_review.disclosed_conditions) AS snapshot "
                "WHERE json_extract(snapshot.value, '$.code') = %s)",
                [code], output_field=BooleanField())
            qs = qs.alias(**{alias: expression}).filter(**{alias: True})
    selected, pagination = paginate(qs, page, limit)
    return JsonResponse({'reviews': [review_json(r, guest_id) for r in selected], 'pagination': pagination})


@endpoint(['GET', 'PATCH', 'DELETE'])
def review_detail(request, pk):
    qs = Review.objects.select_related('profile').filter(pk=pk)
    if request.method != 'GET':
        qs = qs.filter(profile=owner(request))
    r = qs.first()
    if not r:
        return JsonResponse({'error': 'not_found'}, status=404)
    if request.method == 'DELETE':
        r.delete()
        return JsonResponse({'deleted': True})
    if request.method == 'PATCH':
        r.body = review_body(request.payload)
        r.save(update_fields=['body', 'updated_at'])
    return JsonResponse(review_json(r, request.session.get('dietary_owner')))
