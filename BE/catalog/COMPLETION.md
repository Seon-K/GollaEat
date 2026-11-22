# 백엔드 A 미확인 항목 점검

## 기능 구현 확인

| 체크 항목 | 실제 구현 및 상태 |
|---|---|
| 재료·알레르겐·옵션·출처 관계 | FoodDeclaration은 메뉴/구성품 중 한 대상만 참조; 옵션 그룹과 구성품의 메뉴 일치 검사 |
| 매장 분류·연락처·음식 종류 | Restaurant의 DB 필드 및 관리자 편집; 음식 종류 데이터 없는 매장은 빈 값 |
| 미확인 처리 | 가격·좌표 null, 운영정보 unknown, 알레르기 needs_check, 판매 unverified |
| 별도 알레르겐 매핑 | import_catalog_allergens: 명시적인 place_id-브랜드 연결과 메뉴명 정확 일치; 불확실한 결과는 참고 |
| AI 분석 정보 | MenuAnalysisReference·import_menu_analysis·메뉴 상세 analysis_reference 구현; Qwen/Gemini/공공데이터를 미검증 참고로 구분, B 판정 경로와 분리 |
| 성분 근거·확인 시점·범위 | CatalogSource와 FoodDeclaration.applicability_scope, 원문 AllergenLink.payload에 보존 |
| 검증/참고/미확인 구분 | source 검증·기한 검사, link verified_source/reference/inactive, FoodDeclaration 검증 상태 |
| 옵션 실제 적재 | 기본 CSV의 menu_option 원문은 DB에 보존; 구조화된 옵션·제약은 관리자 입력 가능, 자동 추정하지 않음 |
| 지역·음식 종류·영업 필터 | region/category/open_now로 필터링 후 정렬·페이지네이션 |
| B 결합 | 메뉴 목록 personalize=true, 메뉴/구성품 ID 기반 기존 판정·주문 점검 호출 |
| 관리자 접근 제한 | Django 모델별 권한·staff; 보고자가 직접 검증/원본을 수정할 수 없음 |
| 승인·반려·수정 이력 | ReportEvent 처리자·시각·상태 전환, 원본 반영 전/후 값; 거래 단위 롤백 |
| 외부 링크 | reservation_url/directions_url/contact_url/map_url, 미제공 링크 null |
| 주소·장소명 좌표 변환 | 공급자 교체 인터페이스·선택형 Kakao 어댑터·관리자 API/화면 구현; 기본 비활성, 후보 검토 후 빈 좌표에만 미검증 적용 |
| PostgreSQL | 기존 DATABASE_URL/SSL과 catalog migrations 사용; 최신 develop의 격리 PostgreSQL CI 검증 대상, 실제 운영 적용은 미실행 |
| Git 기준 | 최신 develop(팀원 B 변경 포함)에서 feat/catalog-release-ready 준비, ORM 선행 Commit 재적용 및 기존 미커밋 작업 보존 |

## 외부 의존성 / 운영 확인 대기

- 좌표 변환 기능 자체는 구현됐다. 지도 공급자·이용 조건·API 키는 팀 결정 후 설정해야 한다.
  실제 외부 호출은 미실시이며 기본값은 not_configured다. 변환 결과를 검증 완료로 자동 확정하지 않는다.
- 실제 영업시간·휴무·구성품 옵션·예약 링크·음식 분류·검증된 재료 정보는 데이터 담당 결과물 대기.
  등록·조회·수정 기능은 있지만, 그 자료가 채워졌다는 뜻은 아니다.
- 외부 알레르겐 자료의 검토 대기/출처 기준일 누락 항목은 추가 검토가 필요하다.
- 운영 DB 백업·migration 계획 승인·외부 CSV 최초 적재·실제 PostgreSQL/API 검증은 배포 담당과 실행.
- PR #7은 이미 병합되어 닫혔다. 이번 변경은 새 기능 브랜치·새 PR로 검토하며 자동 Merge하지 않는다.
  실제 운영 배포는 수행하지 않는다. CI 결과는 해당 PR의 Checks에서 확인한다.

## 데이터 연동 확인 범위

- PR #13 AI 분석 6,034개는 기존 메뉴의 보조 데이터로만 적재한다. 8,436개 메뉴를 교체하지 않는다.
  분석 없는 2,402개 메뉴는 정상 조회되며 analysis_reference=null이다. 실제 Supabase 적재는 별도 승인 사항이다.

- 정확 일치 연결 후보 715개 중 기존 검토 상태·공식 출처·메뉴 범위·출처 기준일을 충족한
  2개 메뉴의 포함 정보만 B 판정에 사용한다. 나머지 713개는 참고이며 기준을 완화하지 않는다.
- 어떤 자동 매핑에서도 absent_tags나 지점 판매 확인을 생성하지 않는다.
- 모델·입력·조회 기능의 완료와 실제 영업·옵션·성분 데이터의 충족은 별개다.
- CSV 재적재는 기존 메뉴 ID·B 참조·수동 성분/옵션/영업정보를 삭제하지 않는다.
  제보 수정 전/후 기록과 자동 매핑 비활성화·만료 검사도 유지한다.
