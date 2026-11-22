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
    has_location = 'location' in request.payload
    if not isinstance(message, str) or len(message) > 4000 or (not message.strip() and not (reset or has_location)):
        raise ValueError('message must contain 1–4000 characters')
    search = BackendSearch(owner(request))
    state = request.session.get('chat_state')
    if reset or state is None:
        state = search.initial_state()
    state = dict(state)
    if has_location:
        state['location'] = validate_location(request.payload['location'])
        state.pop('place', None)
        state.pop('resolved_place', None)
    if reset and not message.strip():
        request.session['chat_state'] = state
        return JsonResponse({'message': '새 대화를 시작했어요.', 'state': state, 'result': {}})
    try:
        if message.strip():
            next_state, result = chat(message.strip(), state, parse=parse_gemini, search=search)
        else:
            next_state, result = state, search(state)
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        return JsonResponse({'error': 'chat_processing_failed',
                             'message': '질문을 처리하지 못했어요. 다시 시도하거나 지도·필터 검색을 이용해 주세요.'}, status=503)
    request.session['chat_state'] = next_state
    return JsonResponse({'message': format_response(result), 'state': next_state, 'result': result})
