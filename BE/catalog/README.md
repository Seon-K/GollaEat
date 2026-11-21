# Catalog menu API v1

## ORM 조회 및 최초 적재

기본값 `CATALOG_USE_DB=true`는 기존 Django DB의 catalog 테이블을 조회한다.
CSV는 `import_catalog` 실행 때만 필요하다. 기존 CSV 모드가 필요하면
`CATALOG_USE_DB=false`로 명시한다. DB 모드에서 비어 있는 테이블은 빈 목록을 반환한다.

```sh
python manage.py migrate
python manage.py import_catalog --csv /external/final.csv --coordinates /external/validation.csv
```

이 명령은 배포 담당자가 대상 DB와 백업을 확인한 후 실행한다. `--coordinates`는 선택이며
미지정 시 기존 환경변수를 사용한다. 명시적으로 제외하려면 빈 문자열을 전달한다.
재적재는 place_id·preprocess_row_id 기준 upsert이며 원본에 없는 기존 행도 삭제하지 않는다.
메뉴 ID가 다른 식당으로 재할당되면 전체 적재를 롤백한다. 갱신본에서도 메뉴 ID를 보존해야 한다.
B 즐겨찾기·리뷰의 문자열 메뉴 ID는 그대로 유지한다. 검증된 알레르기 연결 데이터가 없으므로
DB 메뉴는 present/absent 태그를 추정하지 않는다.
모델의 data JSON은 기존 응답 원문·옵션·검증 상태를 보존하고 FK와 PK로 식별 관계를 관리한다.

## Common menu response objects

`GET /api/menus`의 `results`, `GET /api/menus/{menu_id}`,
`GET /api/restaurants/{restaurant_id}/menus`의 `results`는 다음 공통 구조를 반환한다.

```json
{
  "menu_id": "menus_000001",
  "menu_name": "메뉴명",
  "restaurant": {"restaurant_id": "2025111196", "restaurant_name": "식당명"},
  "price": {"raw": "79000.0", "amount": 79000, "currency": "KRW", "status": "fixed"},
  "branch_sale_status": "unverified"
}
```

가격 미확인은 `amount: null`, `status: unknown`이며 원문은 보존한다.
매장 연결이 확인되지 않으면 `restaurant` 내부 ID·이름은 `null`이다.
판매 여부는 `unverified`를 유지한다. 기존 상세·매장별 메뉴의 평면 필드와
알레르겐·출처·검증 정보는 삭제하지 않는다. 상세와 목록의 추가 필드는 서로 다를 수 있다.

실서비스 기본 조회는 `DatabaseCatalogRepository`의 Django ORM을 사용한다.
`MockMenuRepository`는 과거 계약 회귀 테스트에서만 사용한다. 백엔드 B의 `dietary` 앱은 수정하지 않는다.

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

## 외부 데이터가 필요한 항목

- 공신력 있는 영업시간·임시휴무·포장/배달·예약 URL 및 음식 분류 데이터
- 매장 확인을 거친 옵션·구성품과 재료/알레르겐 출처
- 주소 좌표 변환 공급자/키, 좌표 정확성 검증 결과
- 비정형·범위형 가격은 원문 보존, 숫자 가격이 없으면 `unknown`으로 처리

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
