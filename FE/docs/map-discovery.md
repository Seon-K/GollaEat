# 홈·지도 탐색

- `/explore`: 홈 식당 목록. 서버 category/judgement_status/sort와 페이지 조회 사용. 식당 선택 시 공통 메뉴 목록을 바텀시트에 표시.
- `/map`: 식당 단위 지도 탐색. 홈·지도 필터 상태는 각각 메모리에 보관하고 탭 이동 후 복원.
- `/my`: 기존 마이 화면. 새로고침하면 탐색 상태와 위치는 초기화된다.

## API

백엔드 계약은 `../../BE/catalog/API.md`의 지도 탐색 확장을 따른다.
`getRestaurants` provider가 bounds/personalize/match_only/category/가격을 전달하고,
어댑터가 식당 집계와 대표 메뉴를 UI 모델로 변환한다.
식이 판정은 서버 결과만 사용하며 analysis_reference는 매핑하지 않는다.

기본은 아산 중심 반경 3km. 프로필이 있으면 일치 메뉴가 있는 식당만 조회한다.
판정 필터는 전체·일치·불일치·추가 확인 필요를 제공한다. 식이조건이 없으면 일치로 추정하지 않는다.
현재 위치 사용 버튼은 위치 사용 안내 후 브라우저 권한을 요청한다.
거부·오류·시간 초과·미지원에서도 아산 또는 사용자가 이동한 영역을 탐색할 수 있다.
실제 위치를 받은 경우만 ‘내 위치에서’ 거리를 표시한다.

지도는 앱 화면 전체에 고정하고 검색창과 조건 배너만 상단에 띄운다.
하단 식당 목록과 음식 종류·정렬·판정 필터는 지도 조작을 막지 않는 바텀시트 안에 배치하며, 손잡이를 위아래로 드래그하거나
펼치기 버튼으로 높이를 조절한다. 상단 필터와 하단 탭을 가리지 않도록 최대 높이를 제한한다.

지도 이동 완료 이벤트의 bounds를 450ms 지연 후 자동 조회한다.
사용자의 실제 위치가 있으면 거리 계산 기준으로 유지하고, 없으면 이동한 지도 중심을 사용한다.
지도가 너무 넓으면 확대 안내를 표시한다. 필터·영역 변경은 첫 페이지부터 다시 조회한다. 판정 필터는 judgement_status로 서버에 전달하고 페이지 처리 전에 적용한다.
목록과 마커는 같은 데이터를 사용하고 더 보기로 추가한다.
새 요청 중에는 목록을 카드 형태의 스켈레톤으로 대체한다. 로딩 문구는 표시하지 않는다. 검색어는 350ms 지연 후 조회한다.

식당 카드 또는 마커를 선택하면 바텀시트에 해당 식당의 메뉴 카드를 표시한다.
GET /api/menus?restaurant_id=...&personalize=true 로 해당 식당만 서버에서 선별하며,
현재 음식 종류·판정 필터와 정렬을 유지한다. 주소/식당명 검색으로 들어온 경우도 메뉴를 볼 수 있도록
식당을 선택한 후에는 검색어를 메뉴 요청에 다시 적용하지 않는다.
메뉴 카드에서 기존 상세 화면으로 이동하고 즐겨찾기를 사용할 수 있다.
‘식당 목록으로’ 버튼으로 돌아간다. 식당이 새로운 지도 조회 결과에서 제외되면 상세 목록을 닫는다.
지도는 결과 갱신 때 재생성하지 않는다.

필터는 ExploreSelect의 커스텀 목록 UI를 사용하고 브라우저 기본 select는 사용하지 않는다.
방향키·Home/End·Enter·Escape와 외부 클릭을 지원한다.
클릭 가능한 버튼·링크·선택 항목은 pointer, 비활성 항목은 not-allowed 커서를 사용한다.
SDK 실패 시 재시도할 수 있으며 지도 연결이 없어도 목록은 사용할 수 있다.

식이조건 변경 시 개인화 쿼리를 무효화한다. API 응답의 X-GollaEat-Session 변경을 감지하면
진행 중 쿼리를 취소하고 캐시를 비운 뒤 서버 프로필을 다시 불러온다.

홈의 지역 선택 버튼·제목·검색창·조건 배너·목록 배치는 기존 형태를 유지한다. 홈에 지도는 표시하지 않는다.
정렬은 추천순·낮은 가격순·높은 가격순이며 가격 상한 선택 UI는 제공하지 않는다.

## 환경변수

FE `.env.local` 또는 빌드 환경:

```dotenv
VITE_KAKAO_MAP_APP_KEY=카카오_JavaScript_키
VITE_DATA_MODE=api
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

VITE 변수는 빌드 시 적용되므로 변경 후 개발 서버 재시작 또는 재빌드가 필요하다.
카카오 콘솔에 실제 개발/배포 웹 도메인을 등록한다.
위치 권한은 HTTPS 또는 localhost에서 사용한다.

기존 관리자 주소 변환 기능이 필요할 때만 BE 환경에 설정:

```dotenv
CATALOG_GEOCODER=catalog.geocoding.KakaoGeocoder
CATALOG_GEOCODER_API_KEY=카카오_REST_API_키
```

지오코딩 키는 FE에 넣지 않는다. 기존 좌표 표시에는 지오코딩 설정이 필요 없다.

## 검증

- `npm run lint`, `npm run build`, `npm run test`
- BE `manage.py test catalog dietary chatbot` (운영 DB와 분리된 테스트 DB)
- 추가 계약 테스트: 영역/반경 검증, 경계, 프로필 미설정, 메뉴 필터/집계,
  대표 메뉴, 판정 후 페이지 처리, 세션 분리, 후보 수 증가 시 쿼리 수.
- 수동 확인: 실제 키로 지도 표시/이동/재검색, 위치 권한 허용/거부, 마커·카드 연동,
  모바일에서 목록 펼치기와 하단 탭 겹침, SDK 오류 재시도.

카카오지도 API: https://apis.map.kakao.com/web/documentation/


## 아산시 탐색 성능

홈·지도·선택 식당 메뉴 요청은 region=아산시를 전달한다.
지역은 판정 후보를 만들기 전에 DB에서 선별하며 기존 UI는 유지한다.
현재 카탈로그는 8,436개 메뉴 모두 아산시여서 지역 제한 자체는 후보 수를 줄이지 않는다.

PostgreSQL에서는 같은 식이조건·메뉴의 전체 판정 결과를 최대 60초 재사용한다.
판정 캐시는 즐겨찾기나 사용자 개인정보를 포함하지 않는다.
키에는 DB visibility snapshot과 식이조건·규칙 정보를 포함하므로,
직접 SQL·일괄 적재를 포함한 DB 쓰기 이후에는 이전 키를 사용하지 않는다.
근거의 valid_until이 더 빠르면 그 시점부터 캐시를 사용하지 않는다.
트랜잭션 안에서는 미커밋 쓰기를 감지할 수 없으므로 캐시를 우회한다.
SQLite/CSV와 사용자 정의 어댑터는 기존 비캐시 경로를 유지한다.
기본 캐시는 프로세스별 메모리이며 최대 20,000개 항목으로 제한한다.
필요하면 DIETARY_JUDGEMENT_CACHE_ENABLED=false로 비활성화한다.

판정 준비에서 메뉴/식당 원문 JSON·설명·분석 원문 payload를 제외하고,
이미 판정한 페이지를 개인화할 때 조건·소유자 조회를 반복하지 않는다.
필터·정렬은 기존과 동일하게 전체 후보에 적용한 다음 페이지 처리한다.

로컬 개발 서버 + 실제 연결 DB의 별도 테스트 게스트(우유 조건) 측정:
- 변경 전 상태 필터: 11.069 / 12.266 / 12.824 / 10.941초
- 변경 후 첫 조회: 9.675초
- 변경 후 반복 조회: 3.277 / 3.381 / 3.339초
- 결과 수: 일치 111 / 불일치 989 / 추가 확인 필요 7,336으로 동일

단일 환경의 측정이며 다른 DB 부하·배포 환경·캐시 만료 후에는 시간이 달라진다.

필터/정렬 변경과 첫 조회는 목록 전체를 스켈레톤으로 대체하고, 더 보기는 기존 카드 아래에 스켈레톤을 추가한다. 지도 결과 수 역시 로딩 중에는 스켈레톤으로 표시한다.


## 홈 페이지네이션과 프론트 캐시

홈은 GET /api/restaurants?personalize=true&page=N&limit=20을 사용해 한 페이지에 최대 20곳을 표시한다. 선택한 식당의 메뉴는 GET /api/menus?restaurant_id=... 으로 별도 조회한다.
이전/다음과 페이지 번호를 제공하며, 누적 더 보기 방식은 사용하지 않는다.
검색·음식 종류·정렬·판정·식이조건이 바뀌면 첫 페이지로 이동한다.
상세/다른 탭에서 돌아오면 같은 조건의 마지막 홈 페이지를 복원한다.

홈 식당 쿼리는 페이지·검색 조건·정규화한 식이조건별로 앱 실행 중 메모리에 보관한다.
시간 경과, 탭 복귀, 창 포커스, 네트워크 재연결만으로 이미 로드된 페이지를 다시 조회하지 않는다.
조회하지 않은 페이지는 스켈레톤을 표시하고, 캐시된 페이지는 즉시 표시한다.
식이조건의 배열 참조/순서만 바뀐 경우에는 캐시를 무효화하지 않는다.
실제 식이조건 변경은 명시적으로 캐시를 무효화하고 세션 변경은 전체 캐시를 비운다.
브라우저 새로고침/앱 재실행 시에는 메모리 캐시가 초기화되어 다시 조회한다.
즐겨찾기는 별도 쿼리의 현재 상태로 표시해 캐시된 페이지에서도 저장/해제를 반영한다.


## Backend search acceleration

The same-origin menu/restaurant contracts are unchanged. PostgreSQL applies personalized
status filters, sort and pagination using persisted per-menu/per-criterion statuses,
then evaluates the versioned input snapshot only for the displayed page. Restaurant counts and representatives
still use the same candidate menus. No frontend environment variable or SDK change is needed.
Existing 20-item pages, skeletons and normalized-profile/page query keys remain in use.
After a backend deployment, refresh the app to clear already-loaded in-memory pages.


## Home restaurant discovery

Home keeps its existing header/search/filter layout and now requests `/api/restaurants`
with `personalize=true`, Asan scope and 20 restaurants per numbered page. Previously
visited restaurant pages remain cached for the app session, keyed by profile and filters.
`RestaurantCard` is shared with the map. Selecting a restaurant opens a scrollable home
bottom sheet containing `RestaurantMenuList`; the map uses the same component in its sheet.
It loads only the selected restaurant's menus, keeps category/status/sort filters, and
supports skeletons, errors/retry, empty results, menu pagination and optimistic bookmarks.
The restaurant search string is excluded from that menu request so a restaurant-name
search does not hide its menus. Menu cards retain their existing detail links.


## Restaurant verdict badges

Shared home/map restaurant cards show green/check-circle match counts, red/x-circle
mismatch counts and amber/alert-triangle needs-check counts. The all-status filter
shows all three. Selecting a status shows only that badge; its count comes from the
matching `dietary_summary` field, not the representative menu. Unconfigured profiles
show a setup prompt. Counts describe menus, never whole-restaurant safety.


## App shell, sheets and personal activity

PhoneFrame now wraps AppProviders so initial session skeletons/errors use the same
430px maximum app width as ready pages. Home modal sheets and map sheets share
continuous pointer resizing, nearest-height snapping and arrow/Home/End keyboard
control. Modal sheets keep content height until resized, limit height to 90dvh,
scroll content independently and support Escape/backdrop/close-button dismissal.

My activity has saved-menu and personal-review tabs. `mine=true` is enforced by
the server; reviews use 20-item numbered pages with skeleton/error/empty states.
Opening the review tab triggers its first query; switching tabs keeps its page.
Review links return to `/my?tab=reviews`. Creating a review invalidates public and
personal review caches. Session cache clearing isolates different users.


## Information correction and contribution

`/menu/:id/report` is titled 정보 오류 and `/menu/:id/contribute` is titled 정보 제보.
Both reuse MenuReportPage with real menu lookup and `POST /api/reports` through the
same-origin provider. Categories map to menu_price / ingredients_allergens / business / other.
Business information targets the restaurant when its ID is available; other submissions
target the menu. Text is required, trimmed and capped at 5,000 characters. Submitting locks
the form; failure retains input; only a confirmed API response displays the receipt number.
No catalog facts or dietary verdicts are updated merely by submitting a report.
Menu detail's staff button aligns right. The staff screen's final contribution button
links to the same form in contribution mode and preserves the staff return destination.


## Review editing and deletion

Menu detail and personal-review lists share ReviewCard. Only `is_mine=true` rows
show the vertical ellipsis action menu. Editing uses `PATCH /api/reviews/{id}` with
`body`; deletion requires confirmation and uses `DELETE` on the same endpoint.
Only the server determines ownership. Requests are not automatically retried; repeated
submissions are guarded, errors retain the draft, and success invalidates both public
and personal review queries. Deleting the last row of a later personal-review page
returns to the preceding page. Review condition badges use compact 24px styling.


## Menu allergen information and guidance

Menu detail displays API allergen_information declarations (verified present entries)
and provided normalized/brand allergen labels. Brand labels are explicitly described
as brand-provided information, not current-branch confirmation. Missing data is shown
as unavailable, never as allergen-free. analysis_reference is not used for display.
The judgement adapter retains server guidance label/message/notice; dietary status
remains the server result. Store confirmation messaging is displayed even for official
franchise-list matches; actual ingredients/recipes and cross-contact need local checking.


## Faster home bootstrap

SessionGate consumes the profile included in `/api/session`; legacy servers without
that field fall back to `/api/profile`. The bootstrap query shares concurrent requests
including development StrictMode calls. Session changes clear prior profile data and
queries; stale bootstrap completions cannot make the next user's screen ready.
ProfileCacheSync mounts after initial profile hydration, avoiding invalidating the
first home query. Subsequent profile edits still invalidate personalized queries.
Home/map request `view=card`; restaurant-menu and detail queries keep full data.
Home page caches remain in-memory for the app session, not persisted across refresh.
