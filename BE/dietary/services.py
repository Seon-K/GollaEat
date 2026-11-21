from .catalog import get_catalog
from .models import Criterion, SupportRule
from .validation import identifiers, order_components
from .messages import unknown_messages

PRIORITY = {'match': 0, 'needs_check': 1, 'mismatch': 2}


def validate_component(data):
    """Malformed adapter evidence must never produce a match."""
    if data is None:
        return None, False
    if not isinstance(data, dict):
        return None, True
    clean = {}
    invalid = False
    for field in ['present_tags', 'absent_tags', 'preference_tags']:
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
    return max((r['status'] for r in results), key=PRIORITY.get, default='match')


def resolve_criteria(profile, codes):
    """None uses the saved profile; a list supplies temporary criterion codes."""
    if codes is None:
        return list(profile.criteria.all())
    identifiers(codes)
    selected = list(Criterion.objects.filter(code__in=codes, active=True))
    if len(selected) != len(set(codes)):
        raise ValueError('Unknown or inactive criterion')
    for criterion in selected:
        if criterion.kind != 'preference':
            rule = SupportRule.objects.filter(criterion=criterion, enabled=True).exclude(source='').first()
            if not rule or not rule.excluded_tags:
                raise ValueError('Unsupported criterion: ' + criterion.code)
    return selected


def evaluate(profile, component_id, modifications=None, *, criteria=None):
    identifiers([component_id])
    if modifications is not None:
        identifiers(modifications)
    criteria = resolve_criteria(profile, criteria)
    data = get_catalog().get_component(component_id)
    data, invalid_data = validate_component(data)
    reasons = []
    unknown = []
    problems = set()
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
        # Client requests are not evidence that ingredients have been removed.
        unknown.append('unverified_modifications')
    status = aggregate(reasons)
    if unknown and status != 'mismatch':
        status = 'needs_check'
    preferences = {c.code for c in criteria if c.kind == 'preference'}
    score = len(preferences & set((data or {}).get('preference_tags', [])))
    messages = unknown_messages(sorted(set(unknown)), {c.code: c.name for c in criteria})
    return {'component_id': component_id, 'status': status, 'reasons': reasons,
            'problem_ingredients': sorted(problems), 'unknown_items': sorted(set(unknown)),
            'unknown_messages': messages,
            'sources': (data or {}).get('sources', []), 'preference_score': score,
            'sort_key': [PRIORITY[status], -score, component_id]}


def rank_menus(profile, menu_ids, *, criteria=None):
    identifiers(menu_ids)
    resolve_criteria(profile, criteria)
    return sorted((evaluate(profile, mid, criteria=criteria) for mid in menu_ids), key=lambda r: r['sort_key'])


def check_order(profile, components):
    order_components(components)
    results = [dict(evaluate(profile, c['id'], c.get('modifications')), role=c['role']) for c in components]
    return {'status': aggregate(results), 'components': results}


def communication(profile, components):
    order = check_order(profile, components)
    criteria = list(profile.criteria.exclude(kind='preference'))
    allergies = '、'.join(c.name for c in criteria if c.kind == 'allergen') or '등록 없음'
    other = '、'.join(c.name for c in criteria if c.kind != 'allergen') or '등록 없음'
    unknown = sorted({x for r in order['components'] for x in r['unknown_messages']})
    return {'status': order['status'], 'text': f'알레르기: {allergies}. 기타 섭취 제한: {other}. '
            f'선택 구성: {", ".join(c["id"] for c in components)}. '
            f'확인 필요: {", ".join(unknown) or "추가 미확인 항목 없음"}. '
            '혹시 주문하려는 메뉴에 위 재료들이 들어가는지 확인해 주실 수 있을까요? '
            '소스나 양념, 육수에 들어가는 재료도 함께 알려주시면 정말 감사하겠습니다.',
            'order': order}
