"""Django 내부 연결. 검색과 성분 증거는 같은 A 카탈로그 어댑터를 사용한다."""
import math

from dietary.catalog import get_catalog
from dietary.models import Criterion
from dietary.services import evaluate, resolve_criteria, EvaluationContext


class UnsupportedCriterion(ValueError):
    pass


def criteria_codes(state):
    codes = list(state.get('criteria', []))
    for field, kind in [('allergens', 'allergen'), ('ingredients', 'ingredient')]:
        for term in state.get(field, []):
            term = {'땅콩': '견과류', '호두': '견과류', '잣': '견과류'}.get(term, term)
            matches = list(Criterion.objects.filter(active=True, kind=kind, name=term))
            # 재료 목록에 없는 이름은 같은 이름의 알레르겐 제한으로 처리한다.
            if not matches and kind == 'ingredient':
                matches = list(Criterion.objects.filter(active=True, kind='allergen', name=term))
            if len(matches) != 1:
                raise UnsupportedCriterion(f'지원하는 식이 조건 목록에서 확인해 주세요: {term}')
            codes.append(matches[0].code)
    return list(dict.fromkeys(codes))


def reason_text(judgement):
    if judgement['status'] == 'match':
        return '확인된 정보상 식이 조건 일치'
    names = [r['name'] for r in judgement['reasons'] if r['status'] == 'needs_check']
    return '、'.join(names) + ' 성분 정보 확인 필요' if names else '메뉴 정보 확인 필요'


class BackendSearch:
    def __init__(self, profile):
        self.profile = profile

    def initial_state(self):
        return {'radius_m': 1000, 'criteria': list(self.profile.criteria.values_list('code', flat=True))}

    def __call__(self, state):
        codes = criteria_codes(state)
        resolve_criteria(self.profile, codes)
        if not codes:
            return {'question': '어떤 알레르기나 제한 재료를 적용할까요?'}
        if state.get("intent") == "explain":
            from .explanation import explain_menu
            return explain_menu(self.profile, state, codes)
        radius = state.get('radius_m', 1000)
        if isinstance(radius, bool) or not isinstance(radius, (int, float)) or not math.isfinite(radius) or radius <= 0:
            raise ValueError('검색 반경은 양수여야 합니다.')
        catalog = get_catalog()
        if not callable(getattr(catalog, 'search_menus', None)):
            from .catalog_search import nearby_menus
            response = nearby_menus(state)
        else:
            response = catalog.search_menus(place=state.get('place'), menu=state.get('menu'),
                                        restaurant=state.get('restaurant'), radius_m=radius)
        if 'question' in response:
            return response
        groups = {'matched': {}, 'needs_check': {}}
        context = EvaluationContext(self.profile, codes)
        context.prime([row['menu_id'] for row in response['menus']])
        seen = set()
        for row in response['menus']:
            distance = row['distance_m']
            if isinstance(distance, bool) or not isinstance(distance, (int, float)) or not math.isfinite(distance) or distance < 0:
                raise ValueError('검색 결과의 거리가 올바르지 않습니다.')
            if distance > radius:
                continue
            identity = (row['restaurant_id'], row['menu_id'])
            if identity in seen:
                continue
            seen.add(identity)
            judgement = evaluate(self.profile, row['menu_id'], context=context)
            if judgement['status'] == 'mismatch':
                continue
            key = 'matched' if judgement['status'] == 'match' else 'needs_check'
            store = groups[key].setdefault(row['restaurant_id'], {
                'restaurant_id': row['restaurant_id'], 'restaurant': row['restaurant_name'],
                'distance_m': distance, 'menus': []})
            store['menus'].append({'menu_id': row['menu_id'], 'name': row['menu_name'],
                                   'reason': reason_text(judgement), 'judgement': judgement,
                                   'branch_sale_status': row.get('branch_sale_status', 'unverified')})
        return {**{key: sorted(stores.values(), key=lambda x: (x['distance_m'], x['restaurant_id']))
                   for key, stores in groups.items()}, 'criteria': codes, 'radius_m': radius}
