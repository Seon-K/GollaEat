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

# 사용자 화면 공통 주의 문구
JUDGEMENT_NOTICE = '실제 포함 여부와 교차접촉 가능성은 주문 전 매장에 한 번 더 확인해 주세요.'


def judgement_guidance(status, reasons, has_conditions):
    # 판정 결과와 근거 유형별 사용자 안내
    if status == 'match':
        if not has_conditions:
            basis, label = 'no_restrictions', '선택된 제한 조건 없음'
            message = '선택한 제한 조건이 없습니다. 이 결과는 성분의 포함·불포함을 확인했다는 의미가 아닙니다.'
        elif reasons and all(
            reason['condition'].startswith('allergen-') and any(
                source.get('interpretation') == 'official_menu_allergen_list'
                for source in reason['sources']) for reason in reasons
        ):
            basis, label = 'official_allergen_list', '공식 알레르겐 표시 기준 일치'
            message = '공식 홈페이지의 알레르겐 정보에 선택한 제한 성분이 기재되어 있지 않습니다.'
        else:
            basis, label = 'verified_information', '확인된 자료 기준 일치'
            message = '확인된 성분 자료상 선택한 제한 조건에 해당하는 성분이 확인되지 않습니다.'
    elif status == 'needs_check':
        basis, label = 'insufficient_information', '추가 확인 필요'
        message = '선택한 제한 성분의 포함 여부를 판단할 정보가 부족하거나 구성·변경 사항에 추가 확인이 필요합니다.'
    else:
        hits = [reason for reason in reasons if reason['status'] == 'mismatch']
        verified = any(reason['verified_problem_ingredients'] for reason in hits)
        origins = {item['origin'] for reason in hits for item in reason['ai_evidence']}
        if verified and origins:
            basis, label = 'verified_and_ai', '제한 성분 확인·분석으로 추천 제외'
            message = '확인된 자료의 제한 성분 포함 정보와 AI 추출·추정 정보에 따라 추천에서 제외했습니다.'
        elif verified:
            basis, label = 'verified_presence', '제한 성분 확인으로 추천 제외'
            message = '공식·검증된 자료에 선택한 제한 성분이 포함되어 있어 추천에서 제외했습니다.'
        elif origins == {'gemini'}:
            basis, label = 'gemini_estimated', 'AI 추정으로 추천 제외'
            message = 'AI가 선택한 제한 성분의 사용 가능성을 추정해 추천에서 제외했습니다. 실제 포함 여부는 확인되지 않았습니다.'
        elif origins == {'qwen'}:
            basis, label = 'qwen_extracted', '메뉴 설명 분석으로 추천 제외'
            message = '메뉴 설명에서 선택한 제한 성분 관련 표현이 추출되어 추천에서 제외했습니다. 실제 사용 여부는 매장에 확인해 주세요.'
        else:
            basis, label = 'ai_analysis', 'AI 분석으로 추천 제외'
            message = 'AI 추출·추정 정보에 선택한 제한 성분 관련 표현이 있어 추천에서 제외했습니다. 실제 사용 여부는 매장에 확인해 주세요.'
    return {'label': label, 'message': message, 'notice': JUDGEMENT_NOTICE, 'basis': basis}


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
