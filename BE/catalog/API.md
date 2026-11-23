# 백엔드 A API 연동 계약

## 지도 탐색 확장

기존 매장 조회는 유지한다. `personalize`, `match_only`, `bounds` 중 하나가 있거나
`sort=dietary`이면 지도 탐색 계약을 적용한다.

```http
GET /api/restaurants?personalize=true&match_only=true&lat=36.7898&lng=127.0017&radius_km=3&category=한식&max_price=10000&sort=dietary&page=1&limit=20
GET /api/restaurants?personalize=true&bounds=126.99,36.78,127.02,36.81&lat=36.7898&lng=127.0017&sort=distance_asc
```

- `personalize=true|false`: 세션 프로필을 사용하는 개인화 요청. 기본 false.
- `match_only=true|false`: 기본 false. true이면 personalize=true 필수.
- `sort=dietary`: personalize=true 필수. 일치 메뉴 보유 여부 → 거리 → 식당 ID순.
- `bounds=west,south,east,north`: 네 개의 유한 좌표, west < east, south < north.
  경도 -180~180, 위도 -90~90, 각 축의 폭은 최대 2도. 경계 포함.
- 지도 탐색 반경은 0 초과 100km 이하. bounds와 radius_km 동시 사용은 400.
- lat/lng은 항상 쌍으로 전달. bounds와 같이 전달하면 검색 영역은 bounds,
  거리 기준은 lat/lng. 좌표가 없으면 distance_km=null이며 거리순 요청은 400.
- bounds/반경 조회에서 좌표 없는 식당은 제외. 지나치게 넓은 지도를 검색하면
  bounds 오류를 반환하므로 확대 후 재검색한다.
- 지도 탐색의 category는 메뉴 분류(빈 메뉴 분류는 매장 분류로 대체) 정확 일치.
  홈 GET /api/menus의 category와 같은 의미다. 기존 일반 매장 조회의 매장 분류 필터는 유지.
- q는 메뉴명·매장명·브랜드·주소 부분 검색. 가격 필터는 알려진 메뉴 가격에 적용.
  category·가격·q를 통과한 같은 메뉴 집합으로 집계와 대표 메뉴를 계산한다.
- 후보 매장 선별 → 메뉴 필터 → 일괄 판정 → 집계 → 일치 필터/정렬 → 페이지 처리.
  가격순은 필터를 통과한 메뉴 중 최저 가격 기준, 미확인 가격은 마지막.

기존 매장 필드에 다음 필드를 추가한다.

```json
{
  "dietary_summary": {
    "match_menu_count": 1,
    "check_menu_count": 2,
    "mismatch_menu_count": 0
  },
  "personalization": {"applied": true, "profile_configured": true},
  "representative_menu": {
    "menu_id": "menu-001",
    "menu_name": "두부 비빔밥",
    "restaurant": {"restaurant_id": "store-001", "restaurant_name": "식당"},
    "category": "한식",
    "distance_km": null,
    "price": {"amount": 9000, "raw": "9000", "currency": "KRW", "status": "fixed"},
    "branch_sale_status": "unverified",
    "judgement": {"component_id": "menu-001", "status": "match"}
  }
}
```

대표 메뉴 judgement는 기존 evaluate의 전체 객체이며 위 예시는 일부 필드만 표시했다.
대표 메뉴는 match → needs_check → mismatch → 메뉴 ID순으로 선정하고, 메뉴가 없으면 null.
프로필에 식이조건이 없거나 개인화 미요청이면 applied=false, profile_configured=false,
일치 수는 0, 등록 메뉴는 check 수로 집계하고 대표 메뉴 judgement는 null이다.
메뉴가 없는 식당의 집계는 모두 0이다. match_only=true이면 이런 식당은 제외한다.
check_menu_count는 서버 needs_check에 대응한다. 프론트에서는 기존 어댑터가 check로 변환한다.
메뉴 일치는 식당 전체의 안전이나 지점 판매 확인을 의미하지 않는다.

pagination은 기존 형식을 유지한다. 지도 마커는 불러온 목록만 표시하며
pagination.total과 현재 표시 수를 함께 안내한다. 전체 영역 클러스터링은 제공하지 않는다.

`GET /api/session`의 기존 identity 필드는 유지하고 cache_identity를 추가한다.
API 응답의 X-GollaEat-Session 헤더는 같은 비인증용 세션 표식을 전달한다.
이 값이 바뀌면 프론트는 진행 중 조회를 취소하고 캐시·서버 프로필을 갱신한다.
API 응답은 Cache-Control: private, no-store를 사용한다.

지도 표시는 기존 좌표를 사용한다. 주소 변환은 기존 관리자 검토 절차를 그대로 사용하며,
지도 요청 시 자동 지오코딩하거나 카카오 장소 검색 결과를 식이조건 판정 데이터로 사용하지 않는다.

모든 경로는 `/api` 기준, 끝 슬래시 없음. ID는 문자열이며 매장은 `place_id`, 메뉴는
`preprocess_row_id`를 그대로 사용한다. 기본 조회는 Django ORM이다. CSV는 적재 명령에서만
읽는다(기존 CSV 모드는 명시적으로 `CATALOG_USE_DB=false`일 때만 사용).

## 조회 API

| 요청 | 응답 |
|---|---|
| `GET /api/restaurants` | `results`와 `pagination` |
| `GET /api/restaurants/{id}` | 매장 정보·운영정보·`brand_menu_reference` |
| `GET /api/restaurants/{id}/menus` | `results`와 `pagination`, 참고 범위·판매 미확인 안내 |
| `GET /api/menus` | `results`와 `pagination` |
| `GET /api/menus/{id}` | 공통 메뉴 객체·원문·출처·검증 상태·옵션·구성품·재료 근거 |

목록 공통: `q`, `page=1`, `limit=20`(최대 100).
매장: `brand`, `restaurant_type`, `category`, `region`(주소 부분 검색), `open_now=true|false`,
`min_price`, `max_price`, `lat`, `lng`, `radius_km`,
`sort=restaurant_name_asc|distance_asc|price_asc|price_desc`.
매장 가격 필터는 범위 내 알려진 가격의 메뉴가 하나 이상 있는 매장을 반환한다.
매장 가격 정렬은 알려진 최소 메뉴 가격을 기준으로 하며 모르는 값은 마지막이다.
메뉴: `category`, `region`, `open_now`, `min_price`, `max_price`, `lat`, `lng`, `radius_km`,
`sort=menu_name_asc|price_asc|price_desc|distance_asc`, `personalize=true|false`.
매장별 메뉴 목록은 기존 계약대로 `q`, `page`, `limit`만 지원한다.
가격은 0 이상의 정수, 반경은 양의 유한 숫자다. 좌표는 위도 -90~90·경도 -180~180을
함께 보낸다. 거리 정렬·반경 필터는 사용자 좌표가 필수다.

`open_now=true`는 `open`만, false는 `closed|break`만 반환한다. unknown은 양쪽 모두 제외한다.
거리 단위는 km, Haversine 직선거리이며 이동 경로나 좌표 검증 완료를 뜻하지 않는다.
좌표 누락·충돌 시 `null`, 반경 검색에서 제외, 거리 정렬에서는 마지막이다.
미확인 가격은 `null/unknown`, 가격 필터에서는 제외, 가격 정렬에서 마지막이다.

### 메뉴 공통 객체 (예시)

```json
{
  "menu_id": "menus_000001",
  "menu_name": "메뉴명",
  "restaurant": {"restaurant_id": "2025111196", "restaurant_name": "식당명", "latitude": null, "longitude": null},
  "price": {"raw": "가격 문의", "amount": null, "currency": "KRW", "status": "unknown"},
  "distance_km": null,
  "category": "",
  "branch_sale_status": "unverified"
}
```

목록·상세·매장별 메뉴에서 `price`, `restaurant` 구조가 동일하다. 기존 상세 평면 필드도
보존한다. `menu_option`은 수집된 원문이며 구조화된 옵션은 별도 `option_groups`, `components`다.
확인된 판매 상태만 관리자가 `available|unavailable`로 변경한다. 데이터 부재 기본값은 unverified다.
`personalize=true`인 메뉴 목록은 현재 세션 프로필로 B의 기존 판정을 호출해 `judgement`와
`saved`를 추가한다. 식이 판정순 정렬은 `sort=dietary`를 사용하며, 메뉴 ID 목록의 별도 정렬은 B `/api/recommendations/rank`를 사용한다.
저장·리뷰·직원 안내도 기존 B API와 동일한 메뉴 ID를 전달한다.

### 매장 운영정보

`operating_status`: `open|closed|break|unknown`. 주간 시간표의 요일은 월요일 0~일요일 6.
`business_hours`에는 `opens_at`, `closes_at`, `closes_next_day`, `break_start`, `break_end`,
`is_closed`가 포함된다. 날짜별 임시휴무는 `closures`다. 출처와 확인일이 없거나 만료되면
상태는 unknown이며, 전날 자정 넘김 영업도 계산한다. 계산 시간대는 프로젝트의 Asia/Seoul이다.
`takeaway`, `delivery`는 bool 또는 null. 외부 연결은 `reservation_url`, `directions_url`,
`map_url`, `contact_url`이다. 없는 예약 링크나 영업정보는 생성하지 않는다.

좌표가 있는 매장에는 `kakao_map_url`과 `kakao_directions_url`을 추가 제공한다.
사용자 `lat/lng`를 포함한 매장 목록 요청에는 `walking_directions_url`도 제공한다.
출발 좌표가 없으면 도보 링크는 null이다. 기존 map_url/directions_url은 변경하지 않는다.
이는 [Kakao 지도 외부 URL](https://apis.map.kakao.com/web/guide/#routeurl)을 만드는 기능이며
API 호출·실제 도보거리·소요시간 계산은 하지 않는다.

## AI 분석 참고 정보 (메뉴 상세 전용)

`GET /api/menus/{id}`에만 `analysis_reference`를 추가한다. 기존 `Menu` 필드·ID·목록·검색
함수 반환 형식은 유지한다. 분석 레코드가 없으면 `analysis_reference: null`이다.
`ingredient_source=NONE`은 재료 추출/추정이 없다는 뜻이며 구성 음식·참고 음식 정보까지 없다는 뜻은 아니다.

```json
{
  "analysis_reference": {
    "ingredient_source": "GEMINI_ESTIMATED",
    "qwen": {
      "ingredients": [], "components": ["세트"],
      "evidence_level": "NO_EXPLICIT_INGREDIENT",
      "information_status": "NO_EXPLICIT_INGREDIENT"
    },
    "gemini": {"estimated_ingredients": ["우유"], "processing_status": "success"},
    "public_reference": {
      "food_code": "참고 음식 코드", "food_name": "참고 음식",
      "allergens": "우유 | 밀", "allergy_raw": "참고 원문",
      "match_present": true, "status": "UNVERIFIED_SIMILAR_FOOD"
    },
    "restaurant_ingredient_verification": "NOT_VERIFIED",
    "allergy_safety_status": "UNKNOWN_NOT_VERIFIED",
    "verification_status": "unverified",
    "usable_for_dietary_judgement": true,
    "judgement_usage": "mismatch_only",
    "usable_for_verified_absence": false,
    "source": {"filename": "menugen_backend_final.csv", "sha256": "파일 SHA-256", "imported_at": "적재 시각"},
    "notice": "텍스트 추출·AI 추정·유사 음식 참고 정보이며 실제 매장 재료 및 알레르기 안전성을 확인한 정보가 아닙니다."
  }
}
```

- `qwen.ingredients`와 `qwen.components`는 텍스트 추출 결과이며 전체 원재료·주문 옵션을 보장하지 않는다.
- `gemini.processing_status=success`도 재료 목록이 비어 있을 수 있다. 오류/빈 목록은 불포함 증거가 아니다.
- 공공데이터 이름/알레르겐의 `|` 구분 문자열은 원문대로 제공하며 항목별 대응 관계를 임의 생성하지 않는다.
- `public_reference.match_present`는 코드 존재 여부다. 상태 문자열만으로 후보 존재를 판정하지 않는다.
- 적재 시각은 분석 생성·검증 시각이 아니다. 개별 재료 신뢰도·근거 위치·모델 버전은 제공 데이터에 없다.
- 별도 `MenuAnalysisReference` 테이블만 사용하며 FoodDeclaration/AllergenLink/CatalogSource나
  B의 present_tags/absent_tags에 전환하지 않는다. 기존 검증된 2개 메뉴 근거도 변경하지 않는다.

최종 메뉴 DB를 먼저 적재한 뒤 다음 명령을 실행한다(외부 파일, 운영 적용은 별도 승인).

```sh
python manage.py import_menu_analysis --csv /external/menugen_backend_final.csv --dry-run
python manage.py import_menu_analysis --csv /external/menugen_backend_final.csv
```

`preprocess_row_id` 기준 upsert이며 기존 메뉴/매장은 생성·수정·삭제하지 않는다.
행 ID 중복, 기존 메뉴 없음, 매장 ID/메뉴명/매장명 불일치, 잘못된 JSON 목록, 검증 완료 주장 등은
전체 실패로 처리한다. 공백/Unicode/대소문자 이외에는 이름을 유사 매칭하지 않는다.
배치 전체를 먼저 검증하고 트랜잭션으로 반영한다. 재실행은 중복 생성하지 않으며 입력에 없는
기존 분석 레코드는 삭제하지 않는다. CSV 원문은 payload에, 파일명(절대 경로 제외)과 해시는 출처로 저장한다.
분석 컬럼의 빈 문자열 목록은 API에서 `[]`로 정규화하되 원문은 payload에 보존한다.
관리자 화면에서는 조회만 가능하며 일반 API로 참고 정보를 수정·검증 완료 처리할 수 없다.

## 메뉴 옵션·구성품

메뉴 상세의 `option_groups`: `group_id`, `name`, `min_select`, `max_select`, `source`.
`components`: `component_id`, `menu_id`, `name`, `role`, `group_id`, `extra_price`,
`is_default`, `instructions`, `source`, `declarations`.
`extra_price=null`은 무료가 아니라 미확인이다. 구성품 ID는 `component:{UUID}`로 B에도 전달한다.

`POST /api/menus/{id}/options/check`

```json
{"component_ids": ["component:00000000-0000-0000-0000-000000000001"]}
```

응답: `menu_id`, `valid`, `problems`(그룹별 최소/최대/실제 개수), `components`,
`dietary_status: not_determined`, `option_data_status: provided|unknown`.
옵션 데이터가 없으면 `valid: null`로 반환한다. 기본 구성품은 자동 포함한다. 다른 메뉴의 구성품·중복 ID는 400.
이 API는 선택 조합만 점검한다. 식이 조건은 B `/api/orders/check`로 별도 확인한다.
공식 옵션 데이터가 없으면 빈 목록을 반환하며 원문에서 임의 추출하지 않는다.

## 재료·알레르겐 근거

`declarations`: 원문·정규 태그·포함/명시적 불포함/미확인·검증 상태·확인일·미확인 범위·출처.
관리자가 검토 완료로 등록하고, 공식/매장 출처·확인일·유효 기간이 충족된 태그만 B로 전달한다.
출처 미비·만료·미검증·태그 불명은 포함/불포함 판정 근거가 되지 않는다.
하위 성분의 포함은 상위 그룹에도 전달하지만, 불포함은 상위 그룹으로 추정하지 않는다.
메뉴의 기본 구성품에 미확인 정보가 있으면 메뉴 전체의 불포함을 확정하지 않는다.
명시적 불포함에도 미확인 범위가 있으면 `absent_tags`에 포함하지 않는다.
현재 CSV는 검증된 근거를 제공하지 않으므로 초기 메뉴는 여전히 needs_check다.

## 정보 제보

`POST /api/reports`

```json
{
  "menu_id": "menus_000001",
  "category": "menu_price",
  "content": "가격 확인이 필요합니다.",
  "proposed_changes": {"price_amount": 12000}
}
```

`menu_id` 또는 `restaurant_id` 필수. 둘 다 있으면 소속이 같아야 한다.
category: `menu_price|ingredients_allergens|business|other`, 내용 1~5000자.
응답 201: `report_id`, 대상 ID, category, content, proposed_changes, status, created_at, reviewed_at.
`GET /api/reports?page=1&limit=20`, `GET /api/reports/{report_id}`는 본인 제보만 반환한다.
status: `pending|reviewing|resolved|rejected`. 사용자는 처리 상태나 원본을 수정할 수 없다.
관리자 검토 기록·변경 권한이 있는 경우에만 허용된 필드가 반영된다. 재료·알레르겐은 제보
JSON을 자동 적용하지 않고 별도 출처/근거를 관리자가 확인해 수동 반영한다.

쓰기 요청은 B와 동일하게 `GET /api/session`으로 세션·CSRF 토큰을 받은 다음
세션 쿠키와 `X-CSRFToken` 헤더, `Content-Type: application/json`을 전달한다.
프론트가 다른 origin이면 기존 배포 프록시/CSRF 설정을 준수해야 한다.

## 관리자 및 배포

### 주소·장소명 좌표 변환 (관리자 전용, 기본 비활성)

공급자 설정이 기존 프로젝트에 없어 `CATALOG_GEOCODER=catalog.geocoding.Geocoder`를 기본값으로 둔다.
팀에서 공급자와 이용 조건·좌표 보관 정책을 승인하기 전에는 외부 호출하지 않는다.
교체 인터페이스는 `Geocoder.is_configured()` 및
`search(address=..., place_name=..., mode=...)`다. 결과는
`{candidates: [{latitude, longitude, label, address, external_id}], has_more: bool}`이다.

선택 가능한 내장 어댑터는 `catalog.geocoding.KakaoGeocoder`다. 팀이 선택할 때만 환경변수로
지정하고 `CATALOG_GEOCODER_API_KEY`에 REST API 키를 서버 비밀변수로 제공한다.
`CATALOG_GEOCODER_TIMEOUT`은 초 단위이며 기본 5, 최대 30이다. 키는 Git·응답·기록에 넣지 않는다.
키가 없으면 네트워크 요청 없이 `not_configured`다. 다른 공급자는 같은 인터페이스의 클래스를 설정한다.
내장 어댑터는 고정 HTTPS 도메인으로만 호출하고 인증 헤더의 리다이렉트 전달을 차단한다.
공급자 문서: [Kakao Local API](https://developers.kakao.com/docs/ko/local/dev-guide).

- `POST /api/restaurants/{id}/geocode`에 `{"mode":"address"}` 또는 `{"mode":"place"}` 전달.
  DB의 현재 주소·이름으로 검색하며 주소/이름/URL을 요청에서 임의 지정할 수 없다.
- 응답은 `attempt_id`, `restaurant_id`, `provider`, `mode`, `status`, `candidates`,
  `coordinate_verification_status: unverified`, `created_at`, `applied_at`이다.
- status: `not_configured|error|not_found|ambiguous|conflict|unchanged|proposed`.
  후보가 여러 개이거나 다음 페이지가 있으면 ambiguous다. 좌표가 다르면 conflict이며 덮어쓰지 않는다.
- 검색만으로 기존 매장 좌표는 변경하지 않는다. 빈 좌표의 단일 후보만 proposed다.
- `POST /api/geocoding/{attempt_id}/apply`에 `{}`를 보내 명시적으로 적용한다.
  여전히 양쪽 좌표가 비어 있고 주소/이름이 검색 시점과 같아야 한다.
  적용 후에도 `applied_unverified`이며 실제 매장 좌표 검증 완료로 승격하지 않는다.
- 실패·좌표 범위 오류·NaN·중복 후보·기존 좌표·문맥 변경 시 기존 좌표를 보존한다.
- 두 API 모두 active staff 및 `catalog.change_restaurant` 권한과 CSRF가 필수다.
  관리자 매장 액션으로 한 곳씩 후보를 조회하고 GeocodeAttempt 화면에서 검토할 수도 있다.

### 배포 담당 실행 순서

1. 개발/운영 대상 DB와 백업·권한·마이그레이션 계획 승인. `DATABASE_URL`은 기존 Django PostgreSQL URI,
   `CATALOG_USE_DB=true`를 사용한다. 프로젝트 API URL이나 anon 키로 대체하지 않는다.
2. `python manage.py migrate --plan`으로 계획 확인 후 승인된 환경에서 `python manage.py migrate --noinput`.
   Railway에는 이미 pre-deploy migrate가 있으므로 Merge 전 자동 실행 영향을 확인한다.
3. 외부 파일로 `python manage.py import_catalog --csv /external/final.csv --coordinates /external/coordinate_validation.csv`.
   필수는 최종 수집·갱신일 CSV, 좌표 검증 CSV는 선택이다. 재적재는 기존 ID를 유지하고 행을 삭제하지 않는다.
   기존 좌표는 재적재로 자동 교체하지 않으며 충돌한 CSV 좌표는 data 원문에 보존해 검토한다.
4. `python manage.py import_catalog_allergens --allergens /external/allergy_clean.csv --brand-restaurants /external/franchise_stores.csv --dry-run`
   결과 확인 후 `--dry-run`을 빼고 적용한다. 이 명령은 3단계의 DB 메뉴가 먼저 있어야 한다.
5. 초기 빈 DB 기준 매장 356·메뉴 8,436·연결 715(reference 713, verified_source 2)를 확인한다.
   기존 행이 있는 DB는 삭제하지 않으므로 총건수가 더 많을 수 있다. 옵션/영업/성분 미확인 정책은 유지한다.
6. `/api/health/`, 매장·메뉴 목록/상세·매장별 메뉴, 가격·위치 검색, B 판정·주문·즐겨찾기·리뷰,
   관리자 권한·CSRF·정적 파일을 점검한다. CSV 경로를 제거해도 DB 조회가 유지돼야 한다.
7. 지도 공급자·권한·비용·보관 조건 승인 후에만 공급자/키를 설정하고 실제 호출을 확인한다.

외부 CSV는 배포 이미지나 Git에 넣지 않고, 기존 Django 설정으로 대상 PostgreSQL에 연결한
로컬 관리 터미널에서 3~4단계를 실행할 수 있다. 비밀 URI는 소스·명령 이력·로그에 노출하지 않는다.
이번 개발 작업에서는 운영 DB 접속·마이그레이션·적재·실제 외부 좌표 호출을 수행하지 않는다.

### 별도 알레르겐 데이터 연결

최초 `import_catalog` 후 다음 명령으로 이미 DB에 있는 메뉴에만 근거를 연결한다.
CSV는 외부 파일이며 Git에 포함하지 않는다. 원본 메뉴 ID·B 참조는 변경하지 않는다.

```sh
python manage.py import_catalog_allergens --allergens /external/allergy_clean.csv --brand-restaurants /external/franchise_stores.csv --dry-run
python manage.py import_catalog_allergens --allergens /external/allergy_clean.csv --brand-restaurants /external/franchise_stores.csv
```

규칙은 정규화된 `place_id` → 브랜드 명시 목록 → 브랜드·메뉴명 정확 일치다.
이름 정규화는 Unicode·공백·대소문자만 처리하며, 괄호·크기·세트·옵션은 제거하지 않는다.
단일 매장 ID의 복수 브랜드나 중복 메뉴 후보는 적용하지 않는다. 같은 외부 데이터 재실행은 중복 생성하지 않는다.
명시 목록으로 확인한 브랜드는 기존 DB 브랜드가 비어 있을 때만 보완한다.
매칭 결과는 `AllergenLink`, 원문/출처는 `CatalogSource`·payload, 포함 태그는
`FoodDeclaration`으로 저장한다. 적용 범위는 `brand_menu_reference:원문범위`다.
재료 원문은 참고로 보존하며 비정형 재료·옵션을 임의로 검증된 구성품으로 분해하지 않는다.

공식 도메인 레지스트리·기존 육안 검토 완료 상태·메뉴 전체 범위·유효한 출처 기준일이
모두 충족된 포함 정보만 `verified_source`로 연결한다. 현재 레지스트리는 실제 후보 중 검토된
맘스터치·프랭크버거 출처에 한정한다. 그 외는 `reference`다. 이는 브랜드 공개 자료의 포함 근거이며,
현 지점 판매·레시피 변경·교차접촉을 확인했다는 의미가 아니다. `absent_tags`는 생성하지 않는다.
상세의 `allergen_information.brand_reference`에는 원문·외부 ID·매칭 방식·검증 상태·출처가 반환된다.
Qwen·Gemini 재료 정보는 B의 불일치 선별에 사용하며 검증 근거나 불포함으로 승격하지 않는다. 공공데이터 유사 음식은 참고로만 유지한다. 미확인 조건은 needs_check,
확인된 제한 성분 포함은 기존 B 규칙대로 mismatch다.

재실행 시 기존 자동 연결을 재검토해 새 입력에서 제외되거나 모호해진 매핑은 inactive,
자동 성분은 unverified로 내린다. 수동 등록한 성분은 수정/삭제하지 않는다.
메뉴명이 달라진 경우도 기존 자동 태그를 B에 전달하지 않는다.
`--dry-run`은 현재 DB 메뉴와 외부 파일을 읽어 통계만 출력하며 쓰지 않는다.

### 제보 처리 이력

검토 시작·반려·수동 완료·원본 반영은 `ReportEvent`로 처리자·시각·기록을 남긴다.
원본 반영 이벤트는 수정 전/후 값을 저장한다. 이벤트는 관리자에서도 추가/수정/삭제할 수 없다.
일반 사용자는 이력을 생성하거나 검증 상태를 바꿀 수 없다.

`/admin/`에서 매장·메뉴·주간 영업시간·임시휴무·옵션 그룹·구성품·출처·성분 근거·제보를 관리한다.
staff만으로 편집할 수 없고 각 모델의 view/add/change/delete 권한이 필요하다.
매장·메뉴의 기존 PK는 편집 불가하며 메뉴 소속도 고정한다. B의 문자열 참조를 보호하기 위해
매장·메뉴 관리자 삭제는 차단하고 판매 상태로 관리한다. 제보 원문·작성자·처리 상태는
읽기 전용이고, 검토 시작/원본 반영/반려/수동 처리 완료 액션으로 감사 정보를 남긴다.
재적재는 수집 필드만 갱신하며 영업시간·옵션·근거·제보는 삭제하지 않는다.

적용 전 백업·대상 DB·마이그레이션 계획 승인 후 `migrate` 및 `import_catalog`를 실행한다.
CSV/ZIP/로컬 경로는 Git에 추가하지 않는다. 운영 DB 변경·배포는 로컬 테스트와 별도 승인 사항이다.
없는 리소스 404, 잘못된 파라미터/JSON 400, 허용하지 않는 메서드 405, CSRF 누락 403.
정보 미확인은 정상 응답의 unknown/null로 표현하며, 없는 영업/옵션/알레르겐을 만들지 않는다.
# 메뉴 카테고리 필터

`GET /api/menu-categories`

```json
{"categories":["한식","중식","일식","양식","분식","카페","기타"]}
```

전체 메뉴: `GET /api/menus?category=한식`

복수 선택(OR): `GET /api/menus?category=한식&category=중식`

매장별 메뉴: `GET /api/restaurants/{restaurant_id}/menus?category=일식`

카테고리 필터는 페이지 분할 전에 적용한다. 검색어·가격·지역·영업 여부 등 기존 전체 메뉴 필터와 조합 가능하다.
예: `/api/menus?category=한식&category=분식&max_price=15000&sort=price_asc&page=1&limit=20`.
식이 판정순 정렬: `/api/menus?category=한식&sort=dietary`.
매장별 메뉴는 기존 q/page/limit 및 category를 지원한다.
category 생략·빈 값은 전체 조회, 반복 값은 중복 제거, 앞뒤 공백 제거 후 비교한다.
기존 사용자 정의 카테고리와의 호환을 위해 목록 외 문자열도 정확 일치 검색하며 미일치 시 빈 결과를 반환한다.
각 값은 최대 50자, 반복 category는 최대 20개이며 초과 시 400이다.
카테고리 목록은 필터 선택지이며 음식 선호 또는 알레르겐 판정 기준이 아니다.
메뉴 category를 필터링하며 별도 필드인 restaurant_type 또는 매장 category는 변경하지 않는다.
응답의 기존 results/pagination 형식은 유지하며 추가 DB 마이그레이션은 없다.

## AI 판정 및 공식 알레르겐 정책 변경

B의 판정은 Qwen 추출·Gemini 추정의 제한 성분 일치 시 mismatch를 반환한다.
AI 출처는 ai_evidence에서 확인하며 검증 sources와 분리한다.
공식 프랜차이즈 메뉴 전체 알레르겐 목록의 조건·출처가 유효하면 미표시 알레르겐에 대해 match가 가능하다.
match는 공식 표시 정보상 선택한 제한 성분이 기재되어 있지 않다는 뜻이며 섭취 안전성을 보장하지 않는다.
개인화 judgement의 guidance(label/message/notice/basis)를 사용자 화면에 함께 표시한다.
공식 목록 기준 안내: "공식 홈페이지의 알레르겐 정보에 선택한 제한 성분이 기재되어 있지 않습니다."
추가 안내: "실제 포함 여부와 교차접촉 가능성은 주문 전 매장에 한 번 더 확인해 주세요."
Gemini 추정 mismatch에는 포함 확정이 아닌 AI 추정에 따른 추천 제외라는 별도 안내를 반환한다.
자세한 범위와 우선순위는 dietary/README.md의 정책 v2를 따른다.
메뉴 상세에 personalize=true를 지정하면 공통 judgement와 saved를 추가한다.


## 식당 선택 후 메뉴 조회

`GET /api/menus`에 선택적 `restaurant_id`(최대 100자)를 추가한다.
해당 식당의 메뉴를 먼저 선별한 뒤 기존 검색·카테고리·가격 필터, 정렬, 페이지 처리를 적용한다.
`personalize=true`와 `sort=dietary`를 함께 사용할 수 있다.
없는 식당은 HTTP 200과 빈 results를 반환한다. 기존 매장별 메뉴 조회 계약은 유지한다.

```http
GET /api/menus?restaurant_id=store-001&personalize=true&sort=dietary&page=1&limit=20
```


## 판정 상태 필터

`GET /api/menus` 및 지도 탐색 `GET /api/restaurants`에
`judgement_status=match|needs_check|mismatch`를 전달하면 판정 상태로 필터링한다.
미전달 시 전체이며 프론트의 ‘추가 확인 필요’는 needs_check로 변환한다.
음식 분류 및 가격 정렬과 조합할 수 있고, 필터 적용 이후에 페이지를 처리한다.
매장 조회는 personalize=true가 필요하다. 선택 상태의 메뉴가 1개 이상인 식당을 반환하고,
대표 메뉴와 가격 정렬 기준은 해당 상태의 메뉴에서 선택한다. 식당 집계는 음식/가격/검색
조건을 통과한 전체 메뉴의 상태별 수를 유지한다.
식이조건이 없는 프로필의 메뉴는 상태 필터에서 needs_check로 취급하며 match로 추정하지 않는다.
기존 match_only 파라미터는 호환성을 유지하되 needs_check/mismatch 필터와 동시 사용하면 400이다.


## 아산시 범위와 판정 캐시

앱의 홈·지도 요청은 region=아산시를 사용한다. 일반 API는 기존 region 선택 계약을 유지한다.
메뉴 후보 및 지도 식당 후보의 DB 검색에 지역 조건을 우선 적용한다.
PostgreSQL/autocommit에서 기존 EvaluationContext.prime/evaluate 결과를 조건·메뉴·DB snapshot별로
최대 60초 캐시하고, 근거 만료 시점에는 더 일찍 무효화한다.
DB 쓰기는 snapshot을 바꾸므로 캐시와 무관하게 반영된다. 트랜잭션·SQLite·CSV는 캐시를 우회한다.
정렬·판정 필터·페이지 및 반환 계약은 유지한다.


## Persistent dietary search index

PostgreSQL uses `MenuDietaryState` (normalized search document, revision and expiry)
and `MenuDietaryStatus` (menu/criterion status) to filter, sort and paginate in SQL.
Statuses are generated by the existing `evaluate` engine; combined conditions use
mismatch > needs_check > match, with missing conditions treated as needs_check.
Only the selected page loads its versioned evaluator-data snapshot and runs the existing evaluator; original evidence relations are not re-read for every list request. API parameters and response fields remain compatible.
Restaurant aggregation and representative selection use the same filtered menu candidates.
An empty dietary profile never counts as match.

Apply `python manage.py migrate`, then `python manage.py rebuild_dietary_index` before serving traffic.
Migration `0011_fix_dietary_trigger_timestamp` also repairs PostgreSQL functions
installed before the explicit timestamp cast was added to `0009`. Existing databases
must run `migrate`; changing the migration source alone does not update stored functions.
This repair replaces function bodies without deleting or rebuilding index rows.
`--batch-size=1000` controls bounded evaluation batches; `--force` rebuilds all statuses.
Catalog/allergen/analysis import commands rebuild dirty entries after successful writes.
Database triggers invalidate affected menu revisions even for bulk/direct SQL changes;
criterion/rule edits invalidate all entries. Run the rebuild command after bulk rule changes.
Each menu expires at its own next source/declaration time boundary. Small dirty scopes
(up to 100 menus) rebuild on demand. Large dirty scopes and unsupported legacy filters
use the original evaluation path until rebuilt, preserving correctness during maintenance.
Concurrent rebuilds lock states and only publish against matching revisions.
Bump `ENGINE_VERSION` and rebuild when evaluator semantics change.

`CATALOG_DIETARY_INDEX_ENABLED=auto` (default) enables the index on PostgreSQL after migration;
`false` restores the previous path, `true` also enables SQLite for verification.
CSV and custom repositories retain their existing behavior. This adds two derived tables
and invalidation triggers; no spatial database or external service is required.
The existing short-lived full-judgement cache remains available for legacy/detail paths.
The snapshot includes evaluator inputs, not the original CSV/analysis payload. It is
replaced only with a matching menu revision and is checked again before returning a page.


PostgreSQL connection pooling is enabled by default (`psycopg[binary,pool]`).
Each application process maintains 1..5 reusable connections; `CONN_MAX_AGE=0`
returns borrowed connections at the end of a request. Set `DATABASE_POOL_ENABLED=false`
to restore the prior persistent-connection configuration. Account for the number of
worker processes when budgeting DB connections. No new environment variable is required.
Reference: https://docs.djangoproject.com/en/5.2/ref/databases/#connection-pool


### Final local measurements (2026-11-24)

Same local development server / configured PostgreSQL / separate milk-condition guest:
- Previous status-filter API: 11.069 / 12.266 / 12.824 / 10.941 seconds.
- Indexed snapshots + connection pool, first request after restart: 3.187 seconds.
- Subsequent menu filters: 1.625 / 1.868 / 1.346 seconds.
- Counts unchanged: match 111, mismatch 989, needs_check 7,336.
- Map bounds 126.8,36.6,127.3,37: 1.982 / 2.047 / 1.924 / 1.575 seconds;
  result totals 14 / 110 / 356 / 14 respectively, with at most 20 rows per page.
- Index coverage: 8,436 ready menu snapshots and 261,516 criterion statuses.
These are single-environment observations, not latency guarantees. Remote DB round trips
still contribute latency; colocating the deployed API and DB can reduce it further.


Restaurant listing query refinement: the three dietary counts are projected together
in one JSON aggregate. Dietary ordering uses a matching-menu existence check before
pagination. Compact representative fields and a ready, non-expired evaluator snapshot
are loaded together for only the selected page, avoiding separate menu/state reads.
The response contract and pre-pagination status filtering remain unchanged.
In the same local PostgreSQL profiling scenario (milk profile, Asan, 20 restaurants),
warm service calls decreased from 7 SQL queries / 1.350..1.369s to 5 queries /
0.879..0.924s. This excludes HTTP session/profile overhead and is not a latency guarantee.


Personal review list: existing `GET /api/reviews?mine=true&page=N&limit=20`
filters by the current session owner before pagination. Personal-list rows optionally
include `menu_name` and `restaurant_name`, loaded with one batched catalog query;
missing/deleted catalog entries retain their review without fabricated menu names.
Public review and review-creation response contracts remain unchanged.


## Card-only restaurant responses and bootstrap

`GET /api/restaurants?view=card` is an opt-in lightweight response with restaurant_id,
restaurant_name, address, latitude, longitude, distance_km, dietary_summary and
personalization, plus unchanged pagination. It retains all existing search, category,
price, dietary-status, bounds and sort semantics. Indexed card queries skip full
restaurant serialization and representative-menu/evidence reads. `view=full` (default)
preserves the previous response; unsupported views return the existing 400 error shape.
Legacy/CSV repositories project the same card fields after their existing evaluation.

`GET /api/session` now additionally returns `profile: {criteria, setup_completed}` for
the current session. Existing CSRF/identity fields are unchanged. Session/private-cache
behavior and profile-update endpoints remain unchanged; no new environment variables.


Local bootstrap/card verification (same separate guest and Vite proxy path):
- Prior session -> profile -> full restaurants: 2.497..2.553 seconds.
- Combined session/profile -> card restaurants: 1.521..1.548 seconds warm;
  first sequence after the final server restart: 2.198 seconds.
- Restaurant response decreased from 75,847 to 10,149 bytes for 20 rows.
Hangul-only region searches use direct containment (Hangul has no case mapping),
avoiding construction of the complete Unicode fold mapping on Asan's first request;
other region searches keep exact Unicode folding. These are API-sequence timings,
not browser render/load guarantees; remote DB/network latency remains.
