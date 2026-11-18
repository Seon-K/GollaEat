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


def parse_gemini(message):
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY 환경변수가 필요합니다.")
    prompt = ("한국어 식당 검색 입력을 JSON으로 변환한다. 이번 문장에 명시된 변경만 반환한다. "
              "place는 장소, menu는 메뉴명, restaurant는 특정 매장명, allergens는 명시한 알레르겐 배열, "
              "ingredients는 추가로 피할 재료 배열이다. 맛집 추천도 검색 요청이다. "
              "비건 등 유형만 있거나 조건 해제나 의도가 모호하면 question에 확인 질문만 반환한다. "
              "식당이나 성분을 추측하지 않는다. 언급하지 않은 필드는 생략한다.")
    properties = {
        field: {"type": "STRING"}
        for field in ("place", "menu", "restaurant", "question")
    }
    for field in ("allergens", "ingredients"):
        properties[field] = {"type": "ARRAY", "items": {"type": "STRING"}}
    data = {
        "systemInstruction": {"parts": [{"text": prompt}]},
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {"type": "OBJECT", "properties": properties},
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
    return json.loads(output)


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
    if not next_state.get("place") and not next_state.get("restaurant"):
        return next_state, {"question": "어느 장소 근처에서 찾을까요?"}
    if not (next_state.get("allergens") or next_state.get("ingredients")):
        return next_state, {"question": "어떤 알레르기나 제한 재료를 적용할까요?"}
    return next_state, search(next_state)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--gemini", action="store_true", help="Gemini로 질문을 해석합니다.")
    args = parser.parse_args()
    if args.gemini and not os.getenv("GEMINI_API_KEY", "").strip():
        parser.error("GEMINI_API_KEY 환경변수가 필요합니다.")
    parse = parse_gemini if args.gemini else parse_demo
    state = {"radius_m": 1000}
    print("골라잇 | 가상 검색 데이터 | 종료: /끝")
    while True:
        try:
            message = input("> ").strip()
            if message == "/끝":
                break
            if message:
                state, result = chat(message, state, parse)
                print(format_response(result))
                print(json.dumps({"조건": state, "응답": result}, ensure_ascii=False, indent=2))
        except (EOFError, KeyboardInterrupt):
            break
        except (ValueError, OSError, KeyError, IndexError) as error:
            print("요청 처리 실패:", error)
