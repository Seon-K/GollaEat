"""A 모델 기반 표시 정보 조회 경계"""
from uuid import UUID

from django.conf import settings


def component_summaries(component_ids):
    # 페이지·주문 단위 일괄 조회, 성분 판정과 별도 처리
    if not settings.CATALOG_USE_DB:
        return {}
    from catalog.models import Menu, MenuComponent

    ids = set(component_ids)
    menu_ids = [value for value in ids if not value.startswith('component:')]
    option_ids = []
    option_aliases = {}
    for value in ids:
        if value.startswith('component:'):
            try:
                option_uuid = UUID(value.split(':', 1)[1])
                option_ids.append(option_uuid)
                option_aliases.setdefault(option_uuid, []).append(value)
            except ValueError:
                continue
    result = {}
    if menu_ids:
        for menu in Menu.objects.filter(pk__in=menu_ids).select_related('restaurant'):
            result[menu.pk] = {
                'component_id': menu.pk, 'name': menu.name, 'role': 'menu',
                'menu_id': menu.pk, 'menu_name': menu.name,
                'restaurant': {'restaurant_id': menu.restaurant_id, 'restaurant_name': menu.restaurant.name},
                'price': {'amount': menu.price_amount, 'currency': 'KRW',
                          'status': 'fixed' if menu.price_amount is not None else 'unknown'},
                'sale_status': menu.sale_status,
            }
    if option_ids:
        for option in MenuComponent.objects.filter(pk__in=option_ids).select_related('menu__restaurant'):
            key = 'component:' + str(option.pk)
            result[key] = {
                'component_id': key, 'name': option.name, 'role': option.role,
                'menu_id': option.menu_id, 'menu_name': option.menu.name,
                'restaurant': {'restaurant_id': option.menu.restaurant_id,
                               'restaurant_name': option.menu.restaurant.name},
                'price': {'amount': option.extra_price, 'currency': 'KRW',
                          'status': 'fixed' if option.extra_price is not None else 'unknown'},
                'sale_status': option.menu.sale_status,
            }
            # UUID 표기 차이를 보존한 요청 ID별 표시 정보 연결
            for alias in option_aliases[option.pk]:
                result[alias] = result[key]
    return result
