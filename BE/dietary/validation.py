"""HTTP·서비스 공통 입력 검증"""


def identifiers(value):
    if (not isinstance(value, list) or len(value) > 100
            or any(not isinstance(x, str) or not x.strip() or len(x) > 100 for x in value)):
        raise ValueError('Expected up to 100 nonempty string IDs (max 100 characters)')
    return value


def order_components(values):
    if not isinstance(values, list) or not 1 <= len(values) <= 100:
        raise ValueError('components must contain 1–100 items')
    for item in values:
        if not isinstance(item, dict):
            raise ValueError('Each component must be an object')
        identifiers([item.get('id')])
        if item.get('role') not in ['menu', 'sauce', 'topping', 'side', 'drink']:
            raise ValueError('Invalid component role')
        if 'modifications' in item:
            identifiers(item['modifications'])
    return values
