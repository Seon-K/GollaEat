from .catalog import get_catalog
from .models import SupportRule

PRIORITY = {'match': 0, 'needs_check': 1, 'mismatch': 2}


def aggregate(results):
    return max((r['status'] for r in results), key=PRIORITY.get, default='match')


def evaluate(profile, component_id, modifications=None):
    data = get_catalog().get_component(component_id)
    reasons = []
    unknown = []
    problems = set()
    criteria = list(profile.criteria.all())
    for criterion in criteria:
        if criterion.kind == 'preference':
            continue
        rule = SupportRule.objects.filter(criterion=criterion, enabled=True).exclude(source='').first()
        tags = set(rule.excluded_tags) if rule else set()
        present = set((data or {}).get('present_tags', []))
        absent = set((data or {}).get('absent_tags', []))
        sources = (data or {}).get('sources', [])
        hits = tags & present
        missing = tags - present - absent
        if hits:
            status = 'mismatch'
            problems.update(hits)
        elif not rule or not tags or missing or not sources:
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
    if modifications:
        # Client requests are not evidence that ingredients have been removed.
        unknown.append('unverified_modifications')
    status = aggregate(reasons)
    if unknown and status != 'mismatch':
        status = 'needs_check'
    preferences = {c.code for c in criteria if c.kind == 'preference'}
    score = len(preferences & set((data or {}).get('preference_tags', [])))
    return {'component_id': component_id, 'status': status, 'reasons': reasons,
            'problem_ingredients': sorted(problems), 'unknown_items': sorted(set(unknown)),
            'sources': (data or {}).get('sources', []), 'preference_score': score,
            'sort_key': [PRIORITY[status], -score, component_id]}


def rank_menus(profile, menu_ids):
    return sorted((evaluate(profile, mid) for mid in menu_ids), key=lambda r: r['sort_key'])


def check_order(profile, components):
    results = [dict(evaluate(profile, c['id'], c.get('modifications')), role=c['role']) for c in components]
    return {'status': aggregate(results), 'components': results}


def communication(profile, components):
    order = check_order(profile, components)
    criteria = list(profile.criteria.exclude(kind='preference'))
    allergies = '、'.join(c.name for c in criteria if c.kind == 'allergen') or '등록 없음'
    other = '、'.join(c.name for c in criteria if c.kind != 'allergen') or '등록 없음'
    unknown = sorted({x for r in order['components'] for x in r['unknown_items']})
    return {'status': order['status'], 'text': f'알레르기: {allergies}. 기타 섭취 제한: {other}. '
            f'선택 구성: {", ".join(c["id"] for c in components)}. '
            f'확인 필요: {", ".join(unknown) or "추가 미확인 항목 없음"}. '
            '혹시 주문하려는 메뉴에 위 재료들이 들어가는지 확인해 주실 수 있을까요? '
            '소스나 양념, 육수에 들어가는 재료도 함께 알려주시면 정말 감사하겠습니다.',
            'order': order}
