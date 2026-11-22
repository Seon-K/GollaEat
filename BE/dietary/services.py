from .catalog import get_catalog
from .models import Criterion
from .validation import identifiers, order_components
from .messages import unknown_messages
from .catalog_info import component_summaries
from .order_validation import validate_selection

PRIORITY = {'match': 0, 'needs_check': 1, 'mismatch': 2}


def validate_component(data):
    """성분·출처 형식 검증 및 잘못된 적합 판정 방지"""
    if data is None:
        return None, False
    if not isinstance(data, dict):
        return None, True
    clean = {}
    invalid = False
    for field in ['present_tags', 'absent_tags']:
        value = data.get(field, [])
        if not isinstance(value, list) or any(not isinstance(x, str) or not x.strip() for x in value):
            clean[field] = []
            invalid = True
        else:
            clean[field] = value
    sources = data.get('sources', [])
    if not isinstance(sources, list):
        sources = []
        invalid = True
    clean['sources'] = []
    for source in sources:
        if not isinstance(source, dict) or not any(
            isinstance(source.get(key), str) and source[key].strip()
            for key in ['id', 'url', 'source_url', 'evidence_locator']
        ):
            invalid = True
        else:
            clean['sources'].append(source)
    return clean, invalid


def aggregate(results):
    # 주문 전체 판정 우선순위: 부적합 > 확인 필요 > 적합
    return max((r['status'] for r in results), key=PRIORITY.get, default='match')


class EvaluationContext:
    """요청 단위 프로필·규칙 재사용"""
    def __init__(self, profile, codes=None):
        if codes is not None:
            identifiers(codes)
            self.criteria = list(Criterion.objects.filter(code__in=codes, active=True).exclude(kind='preference').select_related('rule'))
            if len(self.criteria) != len(set(codes)):
                raise ValueError('Unknown or inactive criterion')
        else:
            self.criteria = list(profile.criteria.exclude(kind='preference').select_related('rule').all())
        self.rules = {}
        self.component_data = {}
        for criterion in self.criteria:
            rule = getattr(criterion, 'rule', None)
            if rule and rule.enabled and rule.source:
                self.rules[criterion.code] = rule
            if codes is not None and criterion.kind != 'preference':
                if criterion.code not in self.rules or not rule.excluded_tags:
                    raise ValueError('Unsupported criterion: ' + criterion.code)

    def prime(self, component_ids):
        # 일괄 조회 지원 어댑터의 요청 단위 성분 스냅샷
        batch = getattr(get_catalog(), 'get_components', None)
        if callable(batch):
            data = batch(component_ids)
            if isinstance(data, dict):
                self.component_data.update(data)


def resolve_criteria(profile, codes):
    return EvaluationContext(profile, codes).criteria


def evaluate(profile, component_id, modifications=None, *, criteria=None, context=None):
    identifiers([component_id])
    if modifications is not None:
        identifiers(modifications)
    context = context if context is not None else EvaluationContext(profile, criteria)
    criteria = context.criteria
    data = (context.component_data[component_id] if component_id in context.component_data
            else get_catalog().get_component(component_id))
    data, invalid_data = validate_component(data)
    reasons = []
    unknown = []
    problems = set()
    for criterion in criteria:
        if criterion.kind == 'preference':
            continue
        rule = context.rules.get(criterion.code)
        tags = set(rule.excluded_tags) if rule else set()
        present = set((data or {}).get('present_tags', []))
        absent = set((data or {}).get('absent_tags', []))
        sources = (data or {}).get('sources', [])
        # 명시적 포함·불포함 비교, 누락 성분은 미확인 처리
        hits = tags & present
        missing = tags - present - absent
        if hits:
            status = 'mismatch'
            problems.update(hits)
        elif invalid_data or not rule or not tags or missing or not sources:
            status = 'needs_check'
        else:
            status = 'match'
        unverified = sorted(missing)
        if not rule or not tags:
            unverified.append('supported_rule')
        if not sources:
            unverified.append('source')
        unknown.extend(f'{criterion.code}:{tag}' for tag in unverified)
        reasons.append({'condition': criterion.code, 'name': criterion.name, 'status': status,
                        'problem_ingredients': sorted(hits), 'unknown_items': unverified,
                        'rule_source': rule.source if rule else None, 'sources': sources})
    if not data:
        unknown.append('component_data')
    if invalid_data:
        unknown.append('invalid_component_data')
    if modifications:
        # 미검증 재료 제거 요청의 안전 추정 금지
        unknown.append('unverified_modifications')
    status = aggregate(reasons)
    if unknown and status != 'mismatch':
        status = 'needs_check'
    # 기존 응답 호환용 고정값, 음식 선호 기능 제외
    score = 0
    messages = unknown_messages(sorted(set(unknown)), {c.code: c.name for c in criteria})
    return {'component_id': component_id, 'status': status, 'reasons': reasons,
            'problem_ingredients': sorted(problems), 'unknown_items': sorted(set(unknown)),
            'unknown_messages': messages,
            'sources': (data or {}).get('sources', []), 'preference_score': score,
            'sort_key': [PRIORITY[status], -score, component_id]}


def rank_menus(profile, menu_ids, *, criteria=None):
    # 식이 판정 상태 및 메뉴 ID 기준 정렬
    identifiers(menu_ids)
    context = EvaluationContext(profile, criteria)
    context.prime(menu_ids)
    return sorted((evaluate(profile, mid, context=context) for mid in menu_ids), key=lambda r: r['sort_key'])


def check_order(profile, components, *, context=None):
    order_components(components)
    selection = validate_selection(components)
    context = context if context is not None else EvaluationContext(profile)
    results = [dict(evaluate(profile, c['id'], c.get('modifications'), context=context), role=c['role']) for c in components]
    status = aggregate(results)
    if status == 'match' and selection['status'] == 'needs_check':
        status = 'needs_check'
    return {'status': status, 'components': results, 'selection_validation': selection}


def communication(profile, components):
    # 프로필·미확인 항목 기반 고정 안내 문구
    context = EvaluationContext(profile)
    order = check_order(profile, components, context=context)
    criteria = [c for c in context.criteria if c.kind != 'preference']
    allergies = '、'.join(c.name for c in criteria if c.kind == 'allergen') or '등록 없음'
    other = '、'.join(c.name for c in criteria if c.kind != 'allergen') or '등록 없음'
    unknown = sorted({x for r in order['components'] for x in r['unknown_messages']})
    if order['selection_validation']['status'] == 'needs_check':
        unknown.append('주문 옵션 구성 및 선택 가능 여부 확인 필요')
    summaries = component_summaries([c['id'] for c in components])
    # 미조회 구성의 ID 유지 및 이름 미확인 표시
    labels = [summaries[c['id']]['name'] if c['id'] in summaries
              else f'이름 미확인 구성 ({c["id"]})' for c in components]
    for result in order['components']:
        result['name'] = summaries.get(result['component_id'], {}).get('name')
    return {'status': order['status'], 'text': f'알레르기: {allergies}. 기타 섭취 제한: {other}. '
            f'선택 구성: {", ".join(labels)}. '
            f'확인 필요: {", ".join(unknown) or "추가 미확인 항목 없음"}. '
            '혹시 주문하려는 메뉴에 위 재료들이 들어가는지 확인해 주실 수 있을까요? '
            '소스나 양념, 육수에 들어가는 재료도 함께 알려주시면 정말 감사하겠습니다.',
            'order': order}
