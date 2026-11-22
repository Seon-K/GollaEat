# 챗봇의 Django 연결

현재 B의 실제 `evaluate()`를 호출한다. A의 매장 검색 구현/데이터는 저장소에 없으므로
실제 주변 매장 조회까지 완료된 상태는 아니다. 기본 카탈로그에서는 연동 준비 중을 안내한다.
테스트는 검색/성분 자료만 대역으로 제공하고 실제 Django 기준 DB와 판정 함수를 사용한다.

## 처리 흐름

질문 해석 → 대화 조건 유지 → DB의 조건명에서 표준 코드 조회 → A 검색 → B 판정 →
불일치 제외 → 일치/추가 확인 목록 → 매장 ID별 묶기 → 각 목록 거리순.
판정 근거와 출처는 `judgement`에 원본 그대로 보존한다. Gemini가 판정하지 않는다.
저장 프로필을 최초에 읽고 이후 추가 조건은 대화 상태에만 둔다. 프로필 저장 API는 호출하지 않는다.
현재 조건 추가만 지원하며 해제/교체는 Gemini에서 확인 질문으로 처리한다.

## 실행 (저장소 루트)

```powershell
# 실제 DB를 처음 준비할 때만 실행
BE/.venv/Scripts/python.exe BE/manage.py migrate
# 기존 로컬 프로필 UUID 조회
BE/.venv/Scripts/python.exe BE/manage.py shell -c "from dietary.models import Profile; print(list(Profile.objects.values_list('id', flat=True)))"
Push-Location BE
.venv/Scripts/python.exe -m chatbot.chatbot --backend --profile-id <프로필UUID> --gemini
Pop-Location
```

`GEMINI_API_KEY`는 환경변수에서 읽는다. `--gemini`를 빼면 제한된 데모 입력 해석기를 사용한다.
`--backend`를 빼면 기존 가상 검색을 사용한다. 프로필이 없으면 기존 서비스의
`/api/session`, `/api/profile` 흐름으로 먼저 만든다. CLI의 프로필 선택은 로컬 개발용이다.

## 웹 API

Django 서버의 `GET /api/session`에서 `csrf_token`을 받는다. 같은 세션 쿠키를 유지하고
`POST /api/chat`에 `Content-Type: application/json`과 `X-CSRFToken` 헤더를 보낸다.
서버는 세션에서 사용자 프로필과 이전 대화 조건을 읽는다.

- 질문: `{"message":"순천향대 근처에서 우유 알레르기가 있는 내가 먹을 김밥 찾아줘"}`
- 새 대화: `{"new_conversation":true}`

성공 응답의 `message`는 안내 문구, `state`는 대화 조건, `result`는 검색 결과나 확인 질문이다.
서버에 `GEMINI_API_KEY`를 설정한 뒤 첫 질문과 “우동으로 바꿔줘”를 같은 세션으로 보내면,
검색 어댑터 연결 전에도 `state`에서 이전 장소와 식이 조건이 유지되는지 확인할 수 있다.

## 실제 매장 검색 연동 (API 명세 확정 후 구현 예정)
챗봇의 검색·판정 연결 구조는 준비되어 있다. 백엔드 A의 실제 매장·메뉴 검색은 연동 명세가 아직 확정되지 않아 연결하지 않았다. 검색 입력과 응답 형식이 확정되면, 검색 결과의 메뉴 ID로 성분 근거를 조회하고 식이 판정까지 이어지도록 구현할 예정이다.

## 검증

```powershell
BE/.venv/Scripts/python.exe BE/manage.py test dietary chatbot.test_backend chatbot.test_views
```
