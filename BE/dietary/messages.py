"""미확인 코드 유지 및 한국어 표시 문구"""
TAG_NAMES = {
    'egg': '난류', 'milk': '우유', 'buckwheat': '메밀', 'nuts': '견과류',
    'soy': '대두', 'wheat': '밀', 'mackerel': '고등어', 'crab': '게',
    'shrimp': '새우', 'pork': '돼지고기', 'peach': '복숭아', 'tomato': '토마토',
    'sulfites': '아황산류', 'chicken': '닭고기', 'beef': '쇠고기', 'squid': '오징어',
    'shellfish': '조개류', 'fish': '생선', 'crustacean': '갑각류',
    'other-meat': '기타 육류', 'cheese-butter': '치즈·버터', 'honey': '꿀',
    'gelatin': '젤라틴', 'other-animal': '기타 동물성 재료',
}
GENERAL = {
    'component_data': '선택한 구성의 성분 정보 확인 필요',
    'unverified_modifications': '요청한 재료 제거·옵션 변경의 실제 반영 여부 확인 필요',
    'invalid_component_data': '제공된 성분 정보의 형식 확인 필요',
}


def unknown_messages(items, names):
    messages = []
    for code in items:
        condition, separator, tag = code.partition(':')
        name = names.get(condition, '선택한 식이 조건')
        if not separator:
            message = GENERAL.get(code, '성분 정보 추가 확인 필요')
        elif tag == 'source':
            message = f'{name} 관련 정보 출처 확인 필요'
        elif tag == 'supported_rule':
            message = f'{name}에 적용할 판정 기준 확인 필요'
        elif tag in TAG_NAMES:
            message = f'{TAG_NAMES[tag]} 포함 여부 확인 필요'
        else:
            message = f'{name} 관련 재료 포함 여부 확인 필요'
        if message not in messages:
            messages.append(message)
    return messages
