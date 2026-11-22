# API 명세 갭 · 실응답 정리

> 백엔드: `https://gollaeat-be-production.up.railway.app`  
> 프로브: `npm run probe:api` (`BACKEND_URL` = 호스트만, `/api`는 path에 포함)  
> 샘플: `docs/api-samples/*.json` (2026-11-22, failed=0)

## 연동 시 필수 (명세에 없었음)

Django HTTPS CSRF는 **`X-CSRFToken` + 세션 쿠키 + `Referer`(또는 `Origin`)** 가 필요하다.  
Referer 없으면 HTML 403 (“참조 헤더를 요구…”). 프론트 클라이언트의 변경 요청에도 `Referer`/`Origin`을 같은 origin으로 넣는다.

---

## 1. `judgement.reasons` 항목 실제 형태

샘플: `post_judgements.json` (프로필 `allergen-milk`, `exclude-pork`)

```json
{
  "condition": "allergen-milk",
  "name": "우유",
  "status": "needs_check",
  "problem_ingredients": [],
  "unknown_items": ["milk", "source"],
  "verified_problem_ingredients": [],
  "ai_problem_ingredients": [],
  "ai_evidence": [],
  "rule_source": "GollaEat 성분 태그 계약 v1: milk",
  "sources": []
}
```

- 상위 judgement에도 `unknown_messages: string[]` 가 있다 (명세 미기재).
- 이번 프로브 5건은 모두 `needs_check` — **`match`/`mismatch` + non-empty `problem_ingredients`/`sources` 예시는 미확보** (동일 프로필·아이스크림 메뉴 위주).

## 2. `problem_ingredients` / `unknown_items` / `sources`

| 필드 | 실측 |
|------|------|
| `unknown_items` (reason) | `"milk"`, `"source"`, `"pork"` 등 짧은 태그 |
| `unknown_items` (top-level) | `"allergen-milk:milk"`, `"exclude-pork:source"` 형태 |
| `problem_ingredients` | 이번 샘플은 전부 `[]` |
| `sources` | 이번 샘플은 전부 `[]` |
| `unknown_messages` | 한글 안내 문장 배열 (예: `"우유 포함 여부 확인 필요"`) |

## 3. Pagination

`get_menus.json`:

```json
{
  "page": 1,
  "limit": 5,
  "count": 5,
  "total": 8436,
  "total_pages": 1688,
  "next_page": 2,
  "previous_page": null
}
```

## 4. menus 상세 `components` / `option_groups` / `analysis_reference`

샘플: `get_menu_detail.json` (`menus_008023`)

| 필드 | 실측 |
|------|------|
| `components` | `[]` (빈 배열 — 원소 스키마는 이 샘플로 확인 불가) |
| `option_groups` | `[]` |
| `analysis_reference` | `null` |
| `allergen_information` | `{ allergens_contains_normalized, declarations, brand_reference }` |
| 좌표 | 메뉴 상세에도 `latitude` / `longitude` 존재 |

→ **비어 있지 않은 components/option_groups·analysis_reference 샘플은 추가 프로브 필요** (다른 menu_id).

## 5. chat `result.matched` / `needs_check`

샘플: `post_chat.json`

```json
{
  "message": "현재 확인된 정보에서 식이 조건에 맞는 메뉴를 찾지 못했어요.\n검색 범위를 넓혀 보세요.",
  "state": {
    "radius_m": 1000,
    "criteria": ["allergen-milk", "exclude-pork"],
    "location": { "lat": 36.78, "lng": 127.05 },
    "menu": "김밥",
    "allergens": ["우유"]
  },
  "result": {
    "matched": [],
    "needs_check": [],
    "criteria": ["allergen-milk", "exclude-pork"],
    "radius_m": 1000
  }
}
```

- 명세의 `result.question` 은 **이번 응답에 없음**.
- matched/needs_check **원소 스키마는 빈 배열이라 미확인**.

## 6. 식당 좌표·지도 URL

목록·상세 공통 (실측):

| 필드 | 예 |
|------|-----|
| `latitude` / `longitude` | `36.7755993` / `127.053199` |
| `distance_km` | 숫자 (직선거리) 또는 목록 조건에 따라 존재 |
| `kakao_map_url` | `https://map.kakao.com/link/map/...` |
| `kakao_directions_url` | `https://map.kakao.com/link/to/...` |
| `walking_directions_url` | walk 링크 또는 `null` (상세에서 null인 경우 있음) |
| `map_url` | 네이버 플레이스 등 (명세 외 추가 필드) |

## 7. 오류 응답 실측

| 코드 | 샘플 | body |
|------|------|------|
| 400 | `error_400_judgements.json` | `{ "error": "'menu_id'" }` |
| 404 | `error_404_menu.json` | `{ "error": { "code": "menu_not_found", "message": "menu not found" } }` |
| 403 | `error_403_csrf.json` | HTML 페이지 (invalid CSRF; JSON 아님) |

형식 불일치: 400/404는 JSON, CSRF 403은 Django HTML.

## 8. 프로브에서 확인된 부가 필드 (명세 얇음)

| API | 메모 |
|-----|------|
| `GET /api/profile` | `{ criteria, setup_completed }` |
| `GET /api/favorites` | `favorites[]` + 중첩 `judgement` |
| personalized menus | 목록 항목에 `judgement`, `saved` 포함 |
| `sort_key` | `[statusRank, preferenceScore?, component_id]` 형태 — statusRank: match≈0, needs_check≈1 |

## 남은 갭 (추가 샘플 권장)

1. `status: match` / `mismatch` 판정 + non-empty `problem_ingredients` / `sources`
2. non-empty `components` / `option_groups` / `analysis_reference` (usable_for_dietary_judgement 포함)
3. chat에서 matched/needs_check가 채워진 응답 · `question` 필드 여부
