"""메뉴 식별 후 공통 판정 근거로 설명을 구성한다."""
from catalog.final_repository import get_repository
from dietary.services import evaluate


def explain_menu(profile, state, codes):
    if state.get('menu_id'):
        repository = get_repository()
        selected = repository.get_menu(state['menu_id'])
        if selected is None:
            return {'question': '선택한 메뉴를 찾지 못했어요.'}
        state = {**state, 'menu': selected['menu_name'], 'restaurant': selected['restaurant_name']}
    if not state.get('menu') or not state.get('restaurant'):
        return {'question': '확인할 매장명과 메뉴명을 함께 알려주세요.'}
    repository = get_repository()
    candidates = [menu for menu in repository.list_menus()
                  if state['menu'] in menu['menu_name']
                  and state['restaurant'] in menu['restaurant_name']]
    if not candidates:
        return {'question': '해당 매장과 메뉴를 찾지 못했어요. 등록된 이름을 확인해 주세요.'}
    if len(candidates) != 1:
        choices = list(dict.fromkeys(f"{m['restaurant_name']} · {m['menu_name']}" for m in candidates))
        return {'question': '지점과 메뉴를 더 구체적으로 알려주세요.\n' + '\n'.join(choices[:10])}
    menu = repository.get_menu(state.get('menu_id') or candidates[0]['menu_id'])
    judgement = evaluate(profile, menu['menu_id'], criteria=codes)
    labels = {'match': '확인된 정보상 식이 조건 일치', 'mismatch': '식이 조건 불일치',
              'needs_check': '추가 확인 필요'}
    lines = [f"{menu['restaurant_name']} · {menu['menu_name']}", labels[judgement['status']]]
    if menu.get('description'):
        lines.append('등록된 메뉴 설명: ' + menu['description'])
    for reason in judgement['reasons']:
        lines.append(f"{reason['name']}: {labels[reason['status']]}")
        if reason.get('verified_problem_ingredients'):
            lines.append('확인된 제한 성분: ' + ', '.join(reason['verified_problem_ingredients']))
        for evidence in reason.get('ai_evidence', []):
            lines.append('AI 분석 참고: ' + str(evidence.get('ingredient', '')) + ' (실제 사용 여부 확인 필요)')
        if reason['status'] == 'needs_check':
            lines.append('현재 자료만으로 해당 조건을 확인하기 어려워 직원에게 확인이 필요해요.')
    for source in judgement.get('sources', []):
        lines.append('근거 출처: ' + str(source.get('title') or source.get('id', '')))
    return {'explanation': '\n'.join(lines), 'menu_id': menu['menu_id'],
            'judgement': judgement, 'criteria': codes}
