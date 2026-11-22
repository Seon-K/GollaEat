"""A 분석 응답 정규화 및 AI 불일치 근거 추출"""
from copy import deepcopy
from .ingredient_tags import ingredient_tags

CHANNELS = ('qwen', 'gemini', 'public_reference')


def prepare_reference(reference):
    if reference is None:
        return None
    if not isinstance(reference, dict):
        raise ValueError('analysis_reference must be an object or null')
    result = deepcopy(reference)
    result.update(usage='mismatch_screening_only', affects_judgement=True,
                  usable_for_verified_absence=False)
    for channel in CHANNELS:
        value = reference.get(channel)
        if value is not None and not isinstance(value, dict):
            raise ValueError(f'{channel} must be an object or null')
        result[channel] = deepcopy(value)
    return result


def ai_evidence(reference, component_id):
    if reference is None:
        return [], False
    try:
        reference = prepare_reference(reference)
    except ValueError:
        return [], True
    evidence, invalid = [], False
    source = reference.get('source', {})
    if not isinstance(source, dict):
        source, invalid = {}, True
    for channel, field in [('qwen', 'ingredients'), ('qwen', 'components'), ('gemini', 'estimated_ingredients')]:
        values = (reference[channel] or {}).get(field, [])
        if not isinstance(values, list):
            invalid = True
            continue
        for value in values:
            if not isinstance(value, str) or not value.strip():
                invalid = True
                continue
            tags = ingredient_tags(value)
            if tags:
                evidence.append({'origin': channel, 'ingredient': value,
                    'field': field,
                    'matched_tags': sorted(tags), 'component_id': component_id,
                    'verified': False, 'source': deepcopy(source)})
    return evidence, invalid
