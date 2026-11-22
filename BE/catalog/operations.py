"""Unknown data stays unknown; public reports never directly update catalog records."""
from datetime import datetime, timedelta
import re

from django.core.exceptions import ValidationError, PermissionDenied
from django.db import transaction
from django.utils import timezone

from .models import InformationReport, ReportEvent, Menu, Restaurant
from .repository import normalize_brand


def source_usable(source, now=None):
    now = now or timezone.now()
    return bool(source and source.source_type in {'official', 'store'} and
        (source.url or source.evidence_locator) and source.checked_at and source.checked_at <= now and
        (source.valid_until is None or now <= source.valid_until))


def source_json(source):
    if source is None:
        return None
    return {'id': str(source.pk), 'title': source.title, 'url': source.url or None,
        'evidence_locator': source.evidence_locator or None, 'source_type': source.source_type,
        'checked_at': source.checked_at, 'valid_until': source.valid_until}


def operating_status(restaurant, now=None):
    now = now or timezone.now()
    local = timezone.localtime(now)
    if not restaurant.hours_confirmed_at or restaurant.hours_confirmed_at > now or not source_usable(restaurant.hours_source, now):
        return 'unknown'
    closures = {c.date: c for c in restaurant.closures.all()}
    if local.date() in closures:
        return 'closed' if source_usable(closures[local.date()].source, now) else 'unknown'
    hours = {h.weekday: h for h in restaurant.business_hours.all()}
    for date in (local.date() - timedelta(days=1), local.date()):
        if date in closures:
            continue
        entry = hours.get(date.weekday())
        if entry is None or entry.is_closed:
            continue
        try:
            entry.full_clean()
        except ValidationError:
            return 'unknown'
        start = datetime.combine(date, entry.opens_at, local.tzinfo)
        end = datetime.combine(date + timedelta(days=int(entry.closes_next_day)), entry.closes_at, local.tzinfo)
        if start <= local < end:
            if entry.break_start is not None:
                bs = datetime.combine(date, entry.break_start, local.tzinfo)
                if bs < start:
                    bs += timedelta(days=1)
                be = datetime.combine(date, entry.break_end, local.tzinfo)
                if be <= bs:
                    be += timedelta(days=1)
                if bs <= local < be:
                    return 'break'
            return 'open'
    previous = (local.date() - timedelta(days=1)).weekday()
    return 'closed' if local.weekday() in hours and previous in hours else 'unknown'


def declaration_json(item):
    return {'id': item.pk, 'kind': item.kind, 'name_raw': item.name_raw,
        'canonical_tag': item.canonical_tag or None, 'presence': item.presence,
        'verification_status': item.verification_status, 'confirmed_at': item.confirmed_at,
        'unknown_scope': item.unknown_scope, 'applicability_scope': item.applicability_scope,
        'source': source_json(item.source)}


def component_json(item):
    return {'component_id': 'component:' + str(item.pk), 'menu_id': item.menu_id,
        'name': item.name, 'role': item.role, 'group_id': item.group_id,
        'extra_price': item.extra_price, 'is_default': item.is_default,
        'instructions': item.instructions, 'source': source_json(item.source),
        'declarations': [declaration_json(d) for d in item.declarations.all()]}


def expand_present_tags(tags):
    # 확인된 포함 정보의 상위 그룹 확장, 불포함 역추론 제외
    expansion = {'shrimp': 'crustacean', 'crab': 'crustacean', 'mackerel': 'fish', 'cheese-butter': 'milk'}
    return set(tags) | {expansion[tag] for tag in tags if tag in expansion}


def declared_tags(items):
    present, absent, sources = set(), set(), {}
    now = timezone.now()
    for item in items:
        if item.import_link_id and item.import_link.status != 'verified_source':
            continue
        if item.import_link_id and normalize_brand(item.import_link.menu.name) != normalize_brand(
                item.import_link.payload.get('menu_name_raw', '')):
            continue
        if not (item.verification_status == 'verified' and item.canonical_tag and
                item.confirmed_at and item.confirmed_at <= now and source_usable(item.source, now)):
            continue
        if item.presence not in {'present', 'absent'}:
            continue
        if item.presence == 'absent' and item.unknown_scope.strip():
            continue
        (present if item.presence == 'present' else absent).add(item.canonical_tag)
        sources[item.source_id] = source_json(item.source)
    present = expand_present_tags(present)
    return present, absent - present, sources


def official_menu_allergens(menu):
    # 검토된 프랜차이즈 공식 메뉴 목록의 알레르겐 범위
    empty = (set(), set(), {})
    link = getattr(menu, 'allergen_link', None)
    if not link or link.status != 'verified_source' or not source_usable(link.source):
        return empty
    payload = link.payload
    if (link.source.source_type != 'official' or not isinstance(payload, dict)
            or payload.get('allergen_declaration_scope') != 'menu'
            or payload.get('verification_status') not in {'manual_visual_checked', 'official_image_visual_checked'}
            or normalize_brand(payload.get('menu_name_raw', '')) != normalize_brand(menu.name)
            or normalize_brand(menu.restaurant.brand) != normalize_brand(link.brand)):
        return empty
    from .adapters import DietaryCatalog
    supported = {'egg', 'milk', 'buckwheat', 'nuts', 'soy', 'wheat', 'mackerel', 'crab',
                 'shrimp', 'pork', 'peach', 'tomato', 'sulfites', 'chicken', 'beef', 'squid', 'shellfish'}
    raw = payload.get('allergens_contains_normalized')
    if not isinstance(raw, str):
        return empty
    tokens = [token.strip() for token in re.split(r'[,;|/\n]+', raw) if token.strip()]
    if not tokens or any(token not in DietaryCatalog.TAGS for token in tokens):
        return empty
    present = {DietaryCatalog.TAGS[token] for token in tokens}
    present.update({'고등어': 'mackerel', '게': 'crab', '새우': 'shrimp'}[t]
                   for t in tokens if t in {'고등어', '게', '새우'})
    present = expand_present_tags(present)
    source = dict(source_json(link.source), interpretation='official_menu_allergen_list')
    return present, supported - present, {link.source_id: source}


@transaction.atomic
def apply_report(report_id, reviewer):
    # PostgreSQL cannot lock nullable sides of an OUTER JOIN. Lock each row separately.
    report = InformationReport.objects.select_for_update().get(pk=report_id)
    if not reviewer.has_perm('catalog.change_informationreport'):
        raise PermissionDenied
    if report.status not in {'pending', 'reviewing'}:
        raise ValidationError('이미 처리된 제보입니다.')
    target = (Menu.objects.select_for_update().get(pk=report.menu_id) if report.menu_id else
              Restaurant.objects.select_for_update().get(pk=report.restaurant_id))
    permission = 'catalog.change_menu' if report.menu_id else 'catalog.change_restaurant'
    if not reviewer.has_perm(permission):
        raise PermissionDenied
    if report.category == 'ingredients_allergens':
        raise ValidationError('알레르겐 제보는 출처·성분 근거를 별도로 검토한 후 수동 반영하세요.')
    allowed = ({'name', 'price_amount', 'description', 'category', 'sale_status'} if report.menu_id else
               {'name', 'address', 'phone', 'category', 'takeaway', 'delivery', 'reservation_url', 'directions_url'})
    if not report.review_notes.strip() or not report.proposed_changes or set(report.proposed_changes) - allowed:
        raise ValidationError('검토 기록과 허용된 수정 항목이 필요합니다.')
    before = {key: getattr(target, key) for key in report.proposed_changes}
    for key, value in report.proposed_changes.items():
        field = target._meta.get_field(key)
        if (key in {'takeaway', 'delivery'} and value is not None and not isinstance(value, bool)) or (
            key == 'price_amount' and value is not None and (not isinstance(value, int) or isinstance(value, bool))):
            raise ValidationError('수정 값의 형식이 잘못되었습니다.')
        setattr(target, key, field.clean(value, target))
    target.full_clean()
    target.save()
    report.status, report.reviewed_by, report.reviewed_at = 'resolved', reviewer, timezone.now()
    report.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
    ReportEvent.objects.create(report=report, action='apply', reviewer=reviewer, before=before,
        after={key: getattr(target, key) for key in report.proposed_changes}, notes=report.review_notes)
    return report


@transaction.atomic
def review_report(report_id, reviewer, action):
    report = InformationReport.objects.select_for_update().get(pk=report_id)
    if not reviewer.has_perm('catalog.change_informationreport'):
        raise PermissionDenied
    if report.status not in {'pending', 'reviewing'} or action not in {'review', 'reject', 'resolve_manual'}:
        raise ValidationError('허용되지 않는 처리입니다.')
    if action != 'review' and not report.review_notes.strip():
        raise ValidationError('검토 기록이 필요합니다.')
    if action == 'resolve_manual':
        permission = 'catalog.change_menu' if report.menu_id else 'catalog.change_restaurant'
        if not reviewer.has_perm(permission):
            raise PermissionDenied
    before = report.status
    report.status = {'review': 'reviewing', 'reject': 'rejected', 'resolve_manual': 'resolved'}[action]
    report.reviewed_by, report.reviewed_at = reviewer, timezone.now()
    report.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
    ReportEvent.objects.create(report=report, action=action, reviewer=reviewer,
        before={'status': before}, after={'status': report.status}, notes=report.review_notes)
    return report
