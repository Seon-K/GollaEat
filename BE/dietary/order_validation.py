"""A 모델 기반 주문 선택 제약 검증"""
from uuid import UUID

from django.conf import settings


def validate_selection(components):
    if not settings.CATALOG_USE_DB:
        return {'status': 'needs_check', 'unknown_items': ['option_catalog_unavailable']}
    from catalog.models import Menu, MenuComponent, OptionGroup

    menu_ids, option_ids, keys = set(), set(), set()
    unknown = []
    for item in components:
        raw = item['id']
        try:
            key = ('option', UUID(raw.split(':', 1)[1])) if raw.startswith('component:') else ('menu', raw)
        except ValueError:
            unknown.append(raw)
            continue
        if key in keys:
            raise ValueError('동일 메뉴·옵션 중복 선택')
        keys.add(key)
        (option_ids if key[0] == 'option' else menu_ids).add(key[1])
    menus = set(Menu.objects.filter(pk__in=menu_ids).values_list('pk', flat=True))
    options = {o.pk: o for o in MenuComponent.objects.filter(pk__in=option_ids)}
    unknown.extend(sorted(menu_ids - menus))
    unknown.extend('component:' + str(pk) for pk in option_ids - options.keys())
    for item in components:
        raw = item['id']
        if raw in menus and item['role'] != 'menu':
            raise ValueError('메뉴 구성의 role은 menu여야 합니다')
        if raw.startswith('component:'):
            try:
                option = options.get(UUID(raw.split(':', 1)[1]))
            except ValueError:
                continue
            if option:
                if option.menu_id not in menus:
                    raise ValueError('선택 메뉴에 속하지 않는 옵션')
                if option.role != item['role']:
                    raise ValueError('옵션의 등록된 role과 요청 role 불일치')
    # 기본 구성품 포함, 명시적으로 재선택한 기본 옵션은 1회 계산
    selected = {o.pk: o for o in MenuComponent.objects.filter(menu_id__in=menus, is_default=True)}
    selected.update(options)
    counts = {}
    groups = {g.pk: g for g in OptionGroup.objects.filter(menu_id__in=menus)}
    for option in selected.values():
        if option.group_id:
            if option.group_id not in groups or groups[option.group_id].menu_id != option.menu_id:
                raise ValueError('옵션의 메뉴와 그룹 소속 불일치')
            counts[option.group_id] = counts.get(option.group_id, 0) + 1
    for group in groups.values():
        if not group.min_select <= counts.get(group.pk, 0) <= group.max_select:
            raise ValueError(f'옵션 그룹 선택 개수 위반: {group.name} ({group.min_select}~{group.max_select})')
    return {'status': 'needs_check' if unknown else 'valid', 'unknown_items': sorted(set(unknown))}
