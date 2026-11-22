import logging
from django.db import DatabaseError
from catalog.repository import CatalogDataError

from django.http import JsonResponse

from dietary.views import endpoint, owner
from .backend import BackendSearch
from .catalog_search import validate_location
from .chatbot import chat, format_response, parse_gemini


@endpoint(['POST'])
def chat_view(request):
    message = request.payload.get('message', '')
    reset = request.payload.get('new_conversation', False)
    if not isinstance(reset, bool):
        raise ValueError('new_conversation must be a boolean')
    if not isinstance(message, str) or len(message) > 4000 or (not message.strip() and not (reset or 'location' in request.payload)):
        raise ValueError('message must contain 1–4000 characters')
    search = BackendSearch(owner(request))
    state = request.session.get('chat_state')
    if reset or state is None:
        state = search.initial_state()
    state = dict(state)
    state['criteria'] = search.initial_state()['criteria']
    if 'location' in request.payload:
        state['location'] = validate_location(request.payload['location'])
        state.pop('place', None)
    if reset and not message.strip():
        request.session['chat_state'] = state
        request.session['chat_history'] = []
        request.session['chat_results'] = []
        return JsonResponse({'message': '새 대화를 시작했어요.', 'state': state, 'result': {}})
    try:
        if message.strip():
            context = {
                'state': state,
                'history': request.session.get('chat_history', []) if not reset else [],
                'last_results': request.session.get('chat_results', []) if not reset else [],
            }
            def interpret(text):
                change = parse_gemini(text, context=context)
                if isinstance(change, dict) and change.get('menu_id'):
                    allowed = {row['menu_id'] for row in context['last_results']}
                    if change['menu_id'] not in allowed:
                        return {'question': '확인할 매장명과 메뉴명을 알려주세요.'}
                return change
            next_state, result = chat(message.strip(), state, parse=interpret, search=search)
        else:
            next_state, result = state, search(state)
    except (OSError, ValueError, KeyError, IndexError, TypeError, DatabaseError, CatalogDataError):
        logging.getLogger(__name__).warning("Chat request failed", exc_info=True)
        return JsonResponse({'error': 'chat_processing_failed',
                             'message': '질문을 처리하지 못했어요. 다시 시도하거나 지도·필터 검색을 이용해 주세요.'}, status=503)
    answer = format_response(result)
    if 'question' not in result:
        try:
            generated = parse_gemini(message or '선택한 장소의 검색 결과를 안내해 주세요.', response_data=result)
            if isinstance(generated.get('answer'), str) and generated['answer'].strip():
                answer = generated['answer']
        except (OSError, ValueError, KeyError, IndexError, TypeError):
            pass
    if 'matched' in result:
        request.session['chat_results'] = [
            {'menu_id': menu['menu_id'], 'name': menu['name'], 'restaurant': store['restaurant']}
            for key in ('matched', 'needs_check') for store in result[key] for menu in store['menus']][:60]
    history = [] if reset else request.session.get('chat_history', [])
    history += [{'user': message, 'assistant': answer[:2000]}]
    request.session['chat_history'] = history[-6:]
    request.session['chat_state'] = next_state
    return JsonResponse({'message': answer, 'state': next_state, 'result': result})
