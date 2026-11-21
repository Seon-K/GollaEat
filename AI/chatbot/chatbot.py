"""골라잇 CLI. python chatbot.py [--gemini]. 예시 검색은 테스트 전용."""
import argparse
import json
import os
import re
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


def parse_demo(message):
    """키 없이 대표 대화를 재현하는 제한된 입력 해석기."""
    changes = {}
    for place in ("순천향대", "온양온천역"):
        if place in message:
            changes["place"] = place
    for menu in ("김밥", "우동"):
        if menu in message:
            changes["menu"] = menu
    if "알레르기" in message:
        terms = [x for x in ("우유", "대두") if x in message]
        if not terms:
            return {"question": "데모에서 지원하는 알레르기는 우유와 대두예요."}
        changes["allergens"] = terms
    if "비건" in message:
        return {"question": "이번 검색에서 피하려는 재료를 알려주세요."}
    if re.search("빼|제외|피해", message):
        terms = [x for x in ("우유", "대두", "달걀", "치즈") if x in message]
        if terms:
            changes["ingredients"] = terms
    return changes or {"question": "예시: 순천향대 근처에서 우유 알레르기가 있는 내가 먹을 김밥 찾아줘"}


def parse_gemini(message, *, debug=False):
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY 환경변수가 필요합니다.")
    prompt = ("한국어 식당 검색 입력을 JSON으로 변환한다. 이번 문장에 명시된 변경만 반환한다. "
              "place는 장소, menu는 메뉴명, restaurant는 특정 매장명, allergens는 명시한 알레르겐 배열, "
              "ingredients는 알레르기로 명시하지 않고 피하겠다고 한 재료 배열이다. "
              "김밥이나 우동 같은 음식명은 menu로 분류한다. 명시된 상호나 지점명만 restaurant로 분류한다. "
              "사용자가 알레르기가 있다고 밝힌 식품은 문장 속 수식어에 있어도 allergens에 모두 넣는다. "
              "알레르기가 명시되면 그 식품을 ingredients에 중복해서 넣지 않는다. "
              "맛집 추천도 검색 요청이다. "
              "비건 등 유형만 있거나 조건 해제나 의도가 모호하면 question에 확인 질문만 반환한다. "
              "식당이나 성분을 추측하지 않는다. 언급하지 않은 필드는 생략한다.\n"
              '예시 입력: 순천향대 근처에서 우유 알레르기가 있는 내가 먹을 김밥 찾아줘\n'
              '예시 출력: {"place":"순천향대","menu":"김밥","allergens":["우유"]}\n'
              '예시 입력: 우동으로 바꿔줘\n'
              '예시 출력: {"menu":"우동"}\n'
              '예시 입력: 김밥천국 온양점에서 달걀 빼고 라면 찾아줘\n'
              '예시 출력: {"restaurant":"김밥천국 온양점","menu":"라면","ingredients":["달걀"]}')
    descriptions = {
        "place": "명시된 검색 기준 장소 이름만. 예: 순천향대",
        "menu": "찾거나 변경할 음식 이름만. 예: 김밥, 우동",
        "allergens": "사용자에게 알레르기가 있다고 명시된 식품 이름 목록. 예: [우유]",
        "ingredients": "알레르기 언급 없이 피하겠다고 명시한 재료 이름 목록",
        "restaurant": "명시된 식당 상호 또는 지점명만. 음식명이나 요청 문장을 넣지 말고 상호가 없으면 생략",
        "question": "의도를 해석할 수 없을 때만 사용할 확인 질문",
    }
    properties = {}
    for field, description in descriptions.items():
        schema = {"description": description}
        if field in ("allergens", "ingredients"):
            schema.update(type="ARRAY", items={"type": "STRING"})
        else:
            schema["type"] = "STRING"
        properties[field] = schema
    data = {
        "systemInstruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {"type": "OBJECT", "properties": properties,
                               "propertyOrdering": list(properties)},
        },
    }
    model = quote(os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"), safe="")
    request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(data).encode("utf-8"),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except HTTPError as error:
        if error.code == 429:
            raise ValueError("Gemini 호출 한도에 도달했어요. 잠시 후 다시 시도해 주세요.") from error
        raise ValueError(f"Gemini 호출 실패 (HTTP {error.code})") from error
    candidates = payload.get("candidates", [])
    if not candidates or candidates[0].get("finishReason") != "STOP":
        raise ValueError("Gemini가 질문 해석을 완료하지 못했어요.")
    parts = candidates[0].get("content", {}).get("parts", [])
    output = "".join(part.get("text", "") for part in parts if not part.get("thought"))
    if debug:
        print("[Gemini 원본 JSON]", output)
    parsed = json.loads(output)
    if isinstance(parsed, dict):
        restaurant = parsed.get("restaurant")
        if isinstance(restaurant, str) and (
            restaurant.strip().casefold() in {"", "null", "none"}
            or re.search(r"알레르기.*(?:찾아|추천)|(?:찾아\s*줘|추천해\s*줘)\s*[.!?]*$", restaurant)
        ):
            parsed.pop("restaurant")
    return parsed


def demo_search(state):
    """가상 지점·메뉴와 테스트용 식이 판정 응답. 실제 연동에서는 BE 조회 함수로 교체."""
    groups = {"matched": [], "needs_check": []}
    for name, menu, distance in [("예시 분식점", "김밥", 150), ("예시 우동점", "우동", 350)]:
        if state.get("place") != "순천향대" or state.get("menu") not in (None, menu):
            continue
        if state.get("restaurant") not in (None, name):
            continue
        groups["needs_check"].append({"restaurant": name, "distance_m": distance,
                                      "menus": [{"name": menu, "reason": "재료 정보 없음"}]})
    return groups


def format_response(result):
    if "question" in result:
        return result["question"]
    lines = []
    for key, label in (("matched", "식이 조건 일치"), ("needs_check", "추가 확인 필요")):
        if result[key]:
            lines.append(label)
        elif key == "matched":
            lines.append("현재 확인된 정보에서 식이 조건에 맞는 메뉴를 찾지 못했어요.")
        for store in result[key]:
            for menu in store["menus"]:
                lines.append(
                    f'{store["restaurant"]} · {menu["name"]} · '
                    f'{store["distance_m"]}m · {menu["reason"]}'
                )
    if not (result["matched"] or result["needs_check"]):
        lines.append("검색 범위를 넓혀 보세요.")
    return "\n".join(lines)


def chat(message, state, parse=parse_demo, search=demo_search):
    change = parse(message)
    if not isinstance(change, dict) or change.keys() - {"place","menu","restaurant","allergens","ingredients","question"}:
        raise ValueError("질문 해석 형식 오류")
    next_state = dict(state)
    for field, value in change.items():
        if field in ("allergens", "ingredients"):
            if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
                raise ValueError("식이 조건 형식 오류")
            next_state[field] = list(dict.fromkeys([*state.get(field, []), *value]))
        elif not isinstance(value, str) or not value.strip():
            raise ValueError("입력 형식 오류")
        else:
            next_state[field] = value
    if "question" in change:
        return state, {"question": change["question"]}
    if not next_state.get("place") and not next_state.get("restaurant") and not next_state.get("location"):
        return next_state, {"question": "어느 장소 근처에서 찾을까요?"}
    if not (next_state.get("allergens") or next_state.get("ingredients") or next_state.get("criteria")):
        return next_state, {"question": "어떤 알레르기나 제한 재료를 적용할까요?"}
    return next_state, search(next_state)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--gemini", action="store_true", help="Gemini로 질문을 해석합니다.")
    parser.add_argument("--debug-gemini", action="store_true", help="Gemini 원본 JSON을 터미널에 표시합니다.")
    parser.add_argument("--backend", action="store_true", help="Django 검색·판정 연결을 사용합니다.")
    parser.add_argument("--profile-id", help="백엔드 모드에서 사용할 기존 Profile UUID")
    args = parser.parse_args()
    if args.gemini and not os.getenv("GEMINI_API_KEY", "").strip():
        parser.error("GEMINI_API_KEY 환경변수가 필요합니다.")
    if args.debug_gemini and not args.gemini:
        parser.error("--debug-gemini는 --gemini와 함께 사용하세요.")
    parse = (lambda message: parse_gemini(message, debug=args.debug_gemini)) if args.gemini else parse_demo
    state = {"radius_m": 1000}
    search = demo_search
    if args.backend:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "BE"))
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
        import django
        django.setup()
        from AI.chatbot.backend import BackendSearch
        from dietary.models import Profile
        if not args.profile_id:
            parser.error("--backend에는 기존 --profile-id가 필요합니다.")
        profile = Profile.objects.filter(pk=args.profile_id).first()
        if profile is None:
            parser.error("해당 프로필이 없습니다.")
        search = BackendSearch(profile)
        state = search.initial_state()
    print("골라잇 | " + ("백엔드 연결" if args.backend else "가상 검색 데이터") + " | 종료: /끝")
    while True:
        try:
            message = input("> ").strip()
            if message == "/끝":
                break
            if message:
                state, result = chat(message, state, parse, search)
                print(format_response(result))
                print(json.dumps({"조건": state, "응답": result}, ensure_ascii=False, indent=2))
        except (EOFError, KeyboardInterrupt):
            break
        except (ValueError, OSError, KeyError, IndexError) as error:
            print("요청 처리 실패:", error)
