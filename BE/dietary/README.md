# 백엔드 B API / A 연동 계약

## 내 리뷰 및 본인 여부

리뷰 목록·상세·작성·수정 응답에 현재 비회원 세션 기준 `is_mine`이 추가된다.
작성자 식별자(profile ID, guest ID)는 반환하지 않는다. 세션이 없는 공개 조회는 모두 false이며
조회만으로 프로필을 만들지 않는다. 수정·삭제 권한은 표시값과 별개로 서버에서 계속 검사한다.

```json
{"id":12,"menu_id":"menu-1","body":"방문 후기","is_mine":true,"disclosed_conditions":[],"created_at":"...","updated_at":"..."}
```

`GET /api/reviews?mine=true&page=1&limit=20`은 내 리뷰만 조회한다.
`menu_id`, 반복 가능한 `condition`, 페이지네이션과 함께 사용할 수 있다. 필터는 모두 AND 조건이다.
예: `/api/reviews?mine=true&menu_id=menu-1&condition=allergen-milk`.
mine은 생략하거나 false면 전체 공개 리뷰, true면 본인 리뷰이며 다른 값은 400이다.
세션이 없는 mine=true 요청은 빈 목록이다. 사용자 ID를 지정해 다른 사람의 비공개 소유권을 조회하는 방식은 지원하지 않는다.

## 판정 조회 최적화

메뉴 순위·주문 조합·즐겨찾기 페이지·안내 문구 생성 시 요청 범위의 EvaluationContext를 사용한다.
프로필 기준과 지원 규칙은 JOIN 쿼리 한 번으로 읽어 재사용하고, 응답의 판정·정렬 형식은 유지한다.
요청 간 캐시는 사용하지 않아 다음 요청부터 변경된 프로필·규칙이 반영된다.
메뉴 데이터 조회는 기존 A 어댑터를 사용하며 A의 CSV/DB 조회 방식은 변경하지 않는다.
테스트에서는 100개 메뉴 순위 및 주문·안내 문구의 B 기준 조회가 각각 한 번인지 확인한다.

## PostgreSQL 테스트 (운영 DB와 분리)

Docker가 설치되어 있다면 BE 폴더에서 다음을 실행한다. 테스트 전용 계정/비밀번호이며 운영용이 아니다.

```powershell
docker compose -f compose.postgres-test.yml up -d --wait
.\.venv\Scripts\python.exe manage.py test dietary catalog --noinput --settings=config.test_postgres
docker compose -f compose.postgres-test.yml down
```

전용 설정은 `DATABASE_URL`을 DB 접속에 사용하지 않고 로컬 127.0.0.1:55432의 gollaeat_test_base만 사용한다.
Django가 test_gollaeat DB를 생성해 마이그레이션과 테스트를 실행한 후 삭제한다.
Docker 컨테이너의 데이터는 메모리에만 저장하며 운영 Supabase나 기존 SQLite 데이터를 변경하지 않는다.
로컬 포트 변경 시 compose 포트와 `POSTGRES_TEST_PORT`를 함께 변경해야 한다.
전용 설정으로 runserver/migrate를 실행하지 말고 테스트 명령에만 사용한다.

GitHub Actions의 `Backend PostgreSQL tests`는 임시 PostgreSQL 16을 띄워 같은 테스트를 실행한다.
기존 SQLite 검사도 유지한다. 조건 필터·페이지네이션·유일성·소유권·쿼리 수 테스트를 양쪽 DB에서 검사한다.
외부 CSV가 필요한 기존 테스트 2개는 별도 데이터 없이 건너뛴다.
로컬에서 PostgreSQL 실행 도구가 없으면 SQLite 검증만 가능하며 PostgreSQL 실행 결과는 CI에서 확인해야 한다.

## 목록 조회 및 안내 문구 보완

`GET /api/favorites?page=1&limit=20`, `GET /api/reviews?page=1&limit=20`으로 나눠 조회한다.
page 기본값은 1, limit 기본값은 20이며 최대 100이다. 잘못된 값은 400, 범위 밖 페이지는 빈 배열을 반환한다.
기존 `favorites`, `reviews` 배열 키는 유지하며 다음 메타데이터가 추가된다.

```json
{"pagination":{"page":1,"limit":20,"count":20,"total":42,"total_pages":3,"next_page":2,"previous_page":null}}
```

즐겨찾기는 본인 데이터만 최신 등록순으로 조회하며 해당 페이지의 메뉴만 재판정한다.
리뷰는 최신 등록순이고 메뉴·공개 조건 AND 필터를 **페이지 분할 전에 DB에서 적용**한다.
SQLite는 parameterized json_each EXISTS, PostgreSQL은 JSON containment를 사용한다.
필터는 현재 프로필이 아니라 작성 당시 공개 스냅샷을 기준으로 한다.

판정 응답에는 기존 `unknown_items` 코드 외에 표시용 `unknown_messages` 문자열 배열이 추가된다.
예: `"allergen-milk:milk"` → `"우유 포함 여부 확인 필요"`.
직원 안내 응답의 `text`도 이 한국어 문구를 사용한다. 코드 필드는 기존 연동을 위해 유지한다.
등록되지 않은 성분 태그는 내부 코드를 노출하지 않고 해당 조건의 일반적인 확인 문구로 안내한다.

HTTP뿐 아니라 공통 서비스 직접 호출에서도 ID·임시 조건·옵션·주문 구성을 검증한다.
어댑터 성분 태그는 문자열 배열, sources는 출처 객체 배열이어야 한다.
빈 출처 객체나 잘못된 데이터 형식은 `invalid_component_data`로 표시하여 match를 막는다.
확인된 포함 성분이 있으면 이런 경우에도 mismatch가 우선한다.
출처 검증은 형식 검사이며 실제 내용의 신뢰성·유효 기간 검증은 A 연동 계약을 따른다.
기존 ID만 있는 테스트 출처도 허용하며, 실제 출처 정보를 새로 생성하거나 추정하지 않는다.

목록 기본 응답은 이제 최대 20개이므로 FE는 pagination을 사용해 다음 페이지를 요청해야 한다.
DB 모델 변경이나 새 마이그레이션은 없다. PostgreSQL 분기 실행 검증과 외부 CSV 통합 테스트는 해당 환경이 필요하다.

기존 Django 5.2 + SQLite + 함수형 JsonResponse 방식을 사용한다. AI 호출 및 사용자 로그인 기능 없음.
매장·메뉴·재료·옵션·출처 모델은 만들지 않는다. 즐겨찾기와 리뷰에는 A의 불투명한 ID만 보관한다.

## 시작 및 사용자 식별

```powershell
cd BE
.venv/Scripts/python.exe manage.py migrate
.venv/Scripts/python.exe manage.py test dietary
```

먼저 `GET /api/session`을 호출한다. 응답의 `csrf_token`을 변경 요청의 `X-CSRFToken` 헤더에 넣고,
모든 요청에 같은 세션 쿠키를 보낸다. FE는 기존 Vite `/api` 프록시를 사용한다.
예: `fetch('/api/profile', {method:'PUT', headers:{'Content-Type':'application/json','X-CSRFToken':token}, body:JSON.stringify({criteria:['allergen-milk']})})`.
CSRF 검증을 해제하지 않는다. 세션 UUID는 서버가 생성하며 요청의 사용자 ID는 사용하지 않는다.
세션 쿠키를 잃거나 세션이 만료되면 기존 데이터에 접근할 수 없다. 로그인/다른 기기 동기화는 범위 밖이다.
관리자 로그인도 서비스 데이터의 소유자 식별에 사용하지 않는다.

## API 목록 (끝 슬래시 없음)

| Method | 경로 | 입력 / 동작 |
|---|---|---|
| GET | `/api/session` | 세션·CSRF 초기화 |
| GET | `/api/allergens` | 요청된 17개 한국어 명칭, 견과류 통합 |
| GET | `/api/restricted-ingredients` | 요청된 카테고리·한국어 재료 명칭 |
| GET | `/api/dietary-criteria` | 저장에 사용할 code/name/kind/category |
| GET, PUT, PATCH | `/api/profile` | `{"criteria":["allergen-milk","vegan","prefer-korean"]}`; PUT/PATCH 모두 선택 목록 교체 |
| POST | `/api/judgements` | `{"menu_id":"menu-1"}` |
| POST | `/api/recommendations/rank` | `{"menu_ids":["menu-1","menu-2"]}` |
| POST | `/api/orders/check` | 아래 구성 예시 |
| POST | `/api/communication` | 주문과 같은 입력, 고정 문구와 주문 판정 반환 |
| GET, POST | `/api/favorites` | 생성: `{"menu_id":"menu-1"}`; 목록은 최신 재판정 |
| DELETE | `/api/favorites/{id}` | 본인만 삭제 |
| GET, POST | `/api/reviews` | 아래 작성 예시 |
| GET, PATCH, DELETE | `/api/reviews/{id}` | PATCH: `{"body":"수정한 경험"}`; 본인만 변경 |

프로필 응답: `{"criteria":["allergen-milk"]}`. 기준 미등록/비활성/미지원 입력은 400.
즐겨찾기 생성 응답: `{"id":1,"menu_id":"menu-1"}` (최초 201, 중복 200).
목록: `{"favorites":[{"id":1,"menu_id":"menu-1","judgement":{...}}]}`.
타인의 즐겨찾기·리뷰 변경은 404. 리뷰 GET은 공개 정보이며 소유자 ID를 반환하지 않는다.
리뷰 작성: `{"menu_id":"menu-1","body":"직원에게 성분을 확인했습니다.","disclose_conditions":["allergen-milk"]}`.
응답(201): `{"id":1,"menu_id":"menu-1","body":"직원에게 성분을 확인했습니다.","disclosed_conditions":[{"code":"allergen-milk","name":"우유","kind":"allergen"}],"created_at":"...","updated_at":"..."}`.
미동의 시 공개 조건은 빈 배열. 공개 조건은 본인 현재 제한 조건의 부분집합이어야 하며 작성 시 복사한다.
수정 시에는 본문만 바꿀 수 있다. 프로필 변경이 과거 공개 조건을 바꾸지 않는다.
`GET /api/reviews?menu_id=menu-1&condition=allergen-milk&condition=vegan`은 공개 스냅샷 기준 AND 필터.
목록 응답 키는 `reviews`. 리뷰는 공식 판정의 입력으로 쓰지 않는다.

주문 입력:
```json
{"components":[{"id":"menu-1","role":"menu"},{"id":"sauce-2","role":"sauce","modifications":["remove-milk"]}]}
```
role: menu/sauce/topping/side/drink. 1–100개 구성 필수. 모든 구성을 점검한다.
응답: `{"status":"needs_check","components":[{"component_id":"menu-1","role":"menu",...},{"component_id":"sauce-2","role":"sauce",...}]}`.
구성 하나라도 mismatch면 전체 mismatch, 나머지 중 needs_check가 있으면 전체 needs_check.
수정 요청 문자열은 제거 증명이 아니다. 기존 성분 mismatch를 없애지 않으며 나머지도 needs_check 처리한다.
검증된 변형은 A가 별도 구성 ID로 제공해야 한다.

## A 담당자 연동 계약 v1 (합의 필요)

설정 `DIETARY_CATALOG_ADAPTER = 'your_app.adapters.DietaryCatalog'`로 무인자 클래스를 지정한다.
`get_component(component_id: str) -> dict | None`만 구현하면 된다. 기본 어댑터는 None을 반환하므로
연동 전 메뉴는 needs_check다. HTTP 입력으로 성분 증거를 받지 않는다.

```python
{
    'present_tags': ['milk'],
    'absent_tags': ['egg', 'nuts'],
    'preference_tags': ['prefer-korean'],
    'sources': [{'id': 'source-1', 'title': '공식 성분표', 'url': 'https://example.com/menu',
                 'checked_at': '2026-11-18', 'version': '1'}],
}
```

* present_tags: 확인된 포함 성분. absent_tags: **명시적으로 불포함이 검증된** 성분 태그. 원문에 언급이 없는 것만으로 absent를 만들면 안 된다.
* sources: 이 구성의 present/absent 근거를 뒷받침하는 공식 출처. 만료·불명확한 자료의 absent는 어댑터에서 제거한다. 출처가 없으면 match 불가. 포함·불포함 충돌은 포함이 우선한다.
* 코드와 태그 매핑은 `migrations/0002_seed_criteria.py`가 기준이다. nuts는 땅콩·호두·잣·아몬드 등 통합 그룹이다. nuts 부재는 그룹 전체 부재를 의미해야 한다.
* fish는 고등어 등 모든 생선, crustacean은 게·새우 등 갑각류를 포함한다. 어댑터가 개별 성분을 상위 그룹으로 확장해야 한다. 우유 유래 치즈·버터는 milk와 cheese-butter 태그 모두 반환한다. 계란 종류는 egg로 묶는다.
* other-meat는 소·돼지·닭 이외 육류, other-animal은 나열된 동물성 그룹 이외 성분(어육 추출물 등)의 포괄 태그다. gelatin은 동물 유래 젤라틴이다.
* 비건·락토오보는 해당 규칙의 **모든 태그** 불포함이 확인되어야 match. 이는 성분 기준이며 종교 인증/의학적 안전 판정이 아니다. 종교·건강 조건은 구체적인 지원 규칙과 근거 데이터가 없으므로 초기 제공하지 않는다.
* 교차접촉·조리도구 공유 여부는 현재 성분 계약에 포함되지 않는다. match는 선택한 성분 규칙 충족만 의미한다. 직원 안내 문구는 Figma에 맞춰 메뉴와 소스·양념·육수의 재료 확인을 요청한다.
* A와 합의할 것: ID 네임스페이스·삭제 정책, 성분/상위 그룹 정규화, 근거 출처의 유효 기간, 옵션 관계와 검증된 제거 변형 ID, 교차접촉 데이터, 음식 선호 태그 범위.

## 공통 판정 응답 / A 호출

```json
{
  "component_id":"menu-1", "status":"mismatch",
  "reasons":[{"condition":"allergen-milk","name":"우유","status":"mismatch",
    "problem_ingredients":["milk"],"unknown_items":[],
    "rule_source":"GollaEat 성분 태그 계약 v1: milk","sources":[{"id":"source-1"}]}],
  "problem_ingredients":["milk"],"unknown_items":[],"sources":[{"id":"source-1"}],
  "preference_score":0,"sort_key":[2,0,"menu-1"]
}
```

`dietary.services.evaluate(profile, id)`를 탐색·상세에서 사용한다. 즐겨찾기도 같은 함수를 쓴다.
`rank_menus(profile, ids)`는 상태(match=0, needs_check=1, mismatch=2), 선호 일치 개수 내림차순,
ID 순으로 정렬한다. 선호는 섭취 제한으로 취급하지 않는다. 제한이 없는 사용자는 메뉴 데이터가 존재하면 match다.
자료가 없거나 규칙이 비활성/부재면 unknown_items에 원인을 반환한다.
`communication(profile, components)`는 알레르기·기타 제한·선택 ID·미확인 사항을 고정 템플릿으로 반환한다.

## 관리자 / 검증

기준·지원 규칙·리뷰는 각 Django 모델 권한으로 관리한다. Profile은 별도 `view_profile` 권한이 있어야
모듈 노출/조회 가능하며 수정은 `change_profile` 권한도 필요하다. 개인정보 권한은 필요한 관리자에게만 부여한다.
리뷰 작성자·공개 스냅샷은 Admin에서도 읽기 전용이다.
테스트: 정보 부족/출처 부족, 식이 규칙 전체 확인, 주문 집계·제거 요청, 선호 우선순위,
세션 소유권 차단, 즐겨찾기 중복·재판정, 리뷰 동의·필터·본인 수정삭제, CSRF, 관리자 권한.
