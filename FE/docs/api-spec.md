# 골라잇 API 명세

### 공통 사항

- 기본 경로: `/api`
- 요청·응답 형식: JSON
- URL 끝에 `/`를 붙이지 않습니다.
- 비회원 세션으로 사용자를 구분하며, 같은 세션 쿠키를 유지해야 합니다.
- 변경 요청에는 세션 초기화 시 받은 토큰을 `X-CSRFToken` 헤더로 전달합니다.

### 엔드포인트 목록

| 기능 | Method | Endpoint |
| --- | --- | --- |
| 세션 초기화 | GET | `/api/session` |
| 알레르겐 목록 | GET | `/api/allergens` |
| 제한 재료 목록 | GET | `/api/restricted-ingredients` |
| 전체 식이 기준 목록 | GET | `/api/dietary-criteria` |
| 식이 프로필 조회 | GET | `/api/profile` |
| 식이 프로필 저장·수정 | PUT / PATCH | `/api/profile` |
| 메뉴 적합성 판정·근거 | POST | `/api/judgements` |
| 메뉴 추천 정렬 | POST | `/api/recommendations/rank` |
| 주문 조합 점검 | POST | `/api/orders/check` |
| 직원 안내·문의 문구 | POST | `/api/communication` |
| 즐겨찾기 목록·등록 | GET / POST | `/api/favorites` |
| 즐겨찾기 삭제 | DELETE | `/api/favorites/{id}` |
| 리뷰 목록·작성 | GET / POST | `/api/reviews` |
| 리뷰 상세·수정·삭제 | GET / PATCH / DELETE | `/api/reviews/{id}` |

### 주요 요청·응답 예시

아래 목록 응답은 일부 항목만 표시했습니다.

**1. 세션 초기화**

`GET /api/session`

```
{
  "csrf_token": "발급된 토큰",
  "identity": "guest_session"
}
```

**2. 식이 기준 조회**

`GET /api/dietary-criteria`

```
{
  "criteria": [
    {
      "code": "allergen-milk",
      "name": "우유",
      "kind": "allergen",
      "category": ""
    }
  ]
}
```

**3. 식이 프로필 저장·수정**

`PUT /api/profile`

요청:

```
{
  "criteria": ["allergen-milk", "exclude-pork"]
}
```

응답:

```
{
  "criteria": ["allergen-milk", "exclude-pork"]
}
```

`GET`도 같은 형식으로 반환합니다. `PUT`과 `PATCH` 모두 선택 목록 전체를 교체합니다.

**4. 메뉴 적합성 판정**

`POST /api/judgements`

요청:

```
{
  "menu_id": "menu-1"
}
```

응답 예시 — 식이 조건이 없고 메뉴 데이터가 연결되지 않은 경우:

```
{
  "component_id": "menu-1",
  "status": "needs_check",
  "reasons": [],
  "problem_ingredients": [],
  "unknown_items": ["component_data"],
  "sources": [],
  "preference_score": 0,
  "sort_key": [1, 0, "menu-1"]
}
```

| 상태 | 의미 |
| --- | --- |
| `match` | 식이조건 일치 |
| `needs_check` | 추가 확인 필요 |
| `mismatch` | 식이조건 불일치 |

프로필에 제한 조건이 있으면 `reasons`에 조건별 판단 근거가 포함됩니다.

**5. 메뉴 추천 정렬**

`POST /api/recommendations/rank`

요청:

```
{
  "menu_ids": ["menu-1", "menu-2"]
}
```

응답은 `results` 배열에 위 메뉴 판정 객체들을 담아 반환합니다. 판정 상태와 음식 선호를 기준으로 정렬합니다.

**6. 주문 조합 점검**

`POST /api/orders/check`

요청:

```
{
  "components": [
    {"id": "menu-1", "role": "menu"},
    {"id": "sauce-1", "role": "sauce"}
  ]
}
```

응답은 전체 `status`와 구성별 판정 객체를 담은 `components` 배열로 반환합니다.

지원 구성: `menu`, `sauce`, `topping`, `side`, `drink`

**7. 직원 안내·문의 문구**

`POST /api/communication`

요청 형식은 주문 조합 점검과 동일합니다. 응답에는 다음 필드가 포함됩니다.

| 필드 | 내용 |
| --- | --- |
| `status` | 전체 판정 상태 |
| `text` | 식이 조건과 확인 사항을 담은 안내 문구 |
| `order` | 주문 조합 점검 결과 |

**8. 즐겨찾기 등록·삭제**

`POST /api/favorites`

요청:

```
{
  "menu_id": "menu-1"
}
```

응답 — 최초 등록 `201`, 중복 등록 `200`:

```
{
  "id": 1,
  "menu_id": "menu-1"
}
```

`DELETE /api/favorites/1`

```
{
  "deleted": true
}
```

목록 조회는 `favorites` 배열을 반환하며, 각 항목에 최신 판정 결과인 `judgement`가 포함됩니다.

**9. 리뷰 작성**

`POST /api/reviews`

요청:

```
{
  "menu_id": "menu-1",
  "body": "직원에게 소스 성분을 확인했습니다.",
  "disclose_conditions": ["allergen-milk"]
}
```

응답 — `201`:

```
{
  "id": 1,
  "menu_id": "menu-1",
  "body": "직원에게 소스 성분을 확인했습니다.",
  "disclosed_conditions": [
    {
      "code": "allergen-milk",
      "name": "우유",
      "kind": "allergen"
    }
  ],
  "created_at": "2026-11-18T06:00:00+00:00",
  "updated_at": "2026-11-18T06:00:00+00:00"
}
```

리뷰 목록은 `reviews` 배열로 반환합니다. `menu_id`와 `condition`으로 필터링할 수 있으며, 수정·삭제는 작성자만 가능합니다.

### 오류 및 연동 참고

- `400`: 잘못된 입력
- `403`: CSRF 검증 실패
- `404`: 대상 없음 또는 수정 권한 없음
- `405`: 지원하지 않는 메서드

### 추가 API — 식당·메뉴·지도·AI 참고 정보

#### 1. 엔드포인트

| 기능 | Method | Endpoint |
| --- | --- | --- |
| 식당 목록·검색·지도 | GET | `/api/restaurants` |
| 식당 상세 | GET | `/api/restaurants/{restaurant_id}` |
| 식당별 메뉴 | GET | `/api/restaurants/{restaurant_id}/menus` |
| 메뉴 목록·검색 | GET | `/api/menus` |
| 메뉴 상세·AI 분석 | GET | `/api/menus/{menu_id}` |
| 음식 분류 | GET | `/api/menu-categories` |
| AI 챗봇 | POST | `/api/chat` |

※ 일반 조회는 세션 없이 가능하며, 챗봇·개인화 기능은 세션을 사용합니다.

#### 2. 주요 검색 파라미터

| 파라미터 | 설명 |
| --- | --- |
| `q` | 식당·메뉴 검색어 |
| `page`, `limit` | 페이지·조회 개수 (기본 1, 20) |
| `category`, `region`, `brand` | 음식 분류·지역·브랜드 필터 |
| `min_price`, `max_price` | 가격 범위 |
| `lat`, `lng`, `radius_km` | 위치·반경 검색 |
| `sort` | 가격순·거리순·식이 적합성순 |
| `personalize=true` | 메뉴 개인화 정보 추가 |

**검색 예시**

`GET /api/restaurants?q=갓잇`

`GET /api/restaurants?lat=36.78&lng=127.05&radius_km=2&sort=distance_asc`

`GET /api/menus?category=한식&sort=price_asc`

#### 3. 주요 응답 예시

**메뉴 목록 — `GET /api/menus`**

```
{
  "results": [
    {
      "menu_id": "menus_000006",
      "menu_name": "바베큐폭립파히타세트",
      "restaurant": {
        "restaurant_id": "2025111196",
        "restaurant_name": "갓잇 아산탕정점"
      },
      "price": {
        "amount": 49000,
        "currency": "KRW"
      },
      "category": "양식",
      "distance_km": null
    }
  ],
  "pagination": {}
}
```

※ 주요 필드만 발췌한 예시입니다. `pagination`의 세부 구조는 실제 API 응답을 따릅니다.

**메뉴 상세 — `GET /api/menus/{menu_id}`**

메뉴 목록 필드에 다음 정보가 추가됩니다.

| 필드 | 내용 |
| --- | --- |
| `allergen_information` | 알레르기 정보 |
| `analysis_reference` | AI 분석 참고 정보 |
| `components` | 메뉴 구성요소 |
| `option_groups` | 메뉴 선택 옵션 |

**AI 참고 정보 — `analysis_reference` 내부**

| 필드 | 내용 |
| --- | --- |
| `qwen.ingredients` | 텍스트 추출 재료 |
| `gemini.estimated_ingredients` | AI 추정 재료 |
| `public_reference` | 공공데이터 참고 정보 |
| `verification_status` | 검증 상태 |
| `usable_for_dietary_judgement` | 식이 판정 사용 가능 여부 |

분석 정보가 없으면 `analysis_reference: null`입니다. 현재 AI 정보는 미검증 참고 자료이므로 안전 판정에 직접 사용하지 않습니다.

**AI 챗봇 — `POST /api/chat`**

요청:

```
{
  "message": "우유 알레르기가 있는데 김밥 추천해줘",
  "location": {
    "lat": 36.78,
    "lng": 127.05
  }
}
```

응답 주요 필드: `message`, `state`, `result.matched`, `result.needs_check`, `result.question`

※ 챗봇 응답은 코드 기준이며 운영 POST 검증은 별도로 필요합니다.

#### 4. 프론트엔드 연동 참고

- 목록 API는 `results`, `pagination` 반환
- 메뉴 상세 선택 시 `GET /api/menus/{menu_id}` 호출
- 지도는 `latitude`, `longitude`, `kakao_map_url`, `walking_directions_url` 활용
- `distance_km`는 실제 이동거리가 아닌 직선거리(km)
- AI 참고 정보는 미검증이며, 식이 판정은 백엔드 판정 결과 사용
