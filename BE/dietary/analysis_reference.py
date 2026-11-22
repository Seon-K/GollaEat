"""AI 참고 근거 계약 준비, 판정 입력과 분리"""
from copy import deepcopy

CHANNELS = ('qwen', 'gemini', 'public_data')


def prepare_reference(reference):
    if reference is None:
        return None
    if not isinstance(reference, dict):
        raise ValueError('analysis_reference must be an object or null')
    result = {'usage': 'reference_only', 'affects_judgement': False}
    for channel in CHANNELS:
        value = reference.get(channel)
        if value is not None and not isinstance(value, dict):
            raise ValueError(f'{channel} must be an object or null')
        result[channel] = deepcopy(value)
    return result
