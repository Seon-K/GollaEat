# Catalog menu API v1

백엔드 A의 Mock 기반 메뉴 목록·검색 API다. Django 모델과 DB 테이블은 만들지 않는다.
`repository.MockMenuRepository`를 향후 DB 기반 저장소로 교체할 수 있도록 조회·검증 로직을
`services.py`에 분리했다. 백엔드 B의 `dietary` 앱은 수정하지 않는다.

## Endpoint

`GET /api/menus` (끝 슬래시 없음)

## Query parameters

| 이름 | 기본값 | 규칙 |
|---|---:|---|
| `q` | 빈 문자열 | 메뉴명 또는 식당명 부분 검색, 최대 100자 |
| `min_price` | `0` | 0 이상의 정수, 포함 조건 |
| `max_price` | 없음 | 0 이상의 정수, 포함 조건 |
| `category` | 빈 문자열 | 음식 종류 정확히 일치, 대소문자 무시 |
| `sort` | `menu_name_asc` | `menu_name_asc`, `price_asc`, `price_desc` |
| `page` | `1` | 1 이상의 정수 |
| `limit` | `20` | 1~100 정수 |

정의되지 않은 파라미터, 잘못된 정수·정렬값, `min_price > max_price`는 HTTP 400을 반환한다.
검색 결과가 없거나 존재하지 않는 페이지는 HTTP 200과 빈 `results`를 반환한다.

## Success response

```json
{
  "results": [
    {
      "menu_id": "menu-003",
      "menu_name": "두부 포케",
      "restaurant": {
        "restaurant_id": "restaurant-002",
        "restaurant_name": "그린테이블 아산점"
      },
      "category": "샐러드",
      "price": {
        "raw": "12,000원",
        "amount": 12000,
        "currency": "KRW",
        "status": "fixed"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "count": 1,
    "total": 1,
    "total_pages": 1,
    "next_page": null,
    "previous_page": null
  }
}
```

## Invalid request response

```json
{
  "error": {
    "code": "invalid_query_parameter",
    "parameter": "min_price",
    "message": "min_price must be an integer"
  }
}
```

## Deferred work

- 실제 `Restaurant`, `Menu` 모델과 마이그레이션
- 실제 CSV/Supabase PostgreSQL 데이터 적재 및 조회
- 비정형·범위형 가격 필터 정책
- 거리·영업 상태·식이 판정·즐겨찾기 결합
- 백엔드 B `DietaryCatalog` 어댑터 구현

## Restaurant CSV APIs

두 CSV 경로는 환경변수로 설정한다. 원본 CSV를 수정하거나 DB에 적재하지 않는다.

```powershell
$env:CATALOG_MENU_CSV = 'C:\path\to\allergy_clean.csv'
$env:CATALOG_RESTAURANT_CSV = 'C:\path\to\restaurants.csv'
```

### `GET /api/restaurants`

| 이름 | 기본값 | 규칙 |
|---|---:|---|
| `q` | 빈 문자열 | 지점명·브랜드·주소 부분 검색, 최대 100자 |
| `brand` | 빈 문자열 | 공백·Unicode·대소문자 정규화 후 브랜드 정확 일치 |
| `page` | `1` | 1 이상의 정수 |
| `limit` | `20` | 1~100 정수 |

CSV가 없거나 필수 컬럼이 없으면 HTTP 503을 반환한다. 잘못된 파라미터는 HTTP 400이다.

### `GET /api/restaurants/{restaurant_id}`

`restaurant_id`는 매장 CSV의 `place_id`다. 상세 응답의 `brand_menu_reference`는 브랜드명을
기준으로 연결한 참고 메뉴다. 모든 메뉴에 `branch_sale_status: unverified`를 반환하며 특정 지점의
판매 메뉴라고 확정하지 않는다. 존재하지 않는 매장은 HTTP 404를 반환한다.
