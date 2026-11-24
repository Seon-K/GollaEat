# 골라잇 (GollaEat) — FE (React + Vite)

알레르기·채식·개인 식이 제한이 있는 사용자가 **메뉴 단위**로 먹을 수 있는지 판단받는 모바일 웹앱입니다.  
모노레포에서는 [`Seon-K/GollaEat`](https://github.com/Seon-K/GollaEat)의 `FE/` 디렉터리에 해당합니다.

스택: **React + TypeScript + Vite + React Router** + Tailwind CSS.

홈 / 지도 / 마이 탭과 위치 기반 식당 탐색의 API·환경 설정은
[지도 탐색 문서](docs/map-discovery.md)를 참고하세요.
린트는 React Hooks·TypeScript용 ESLint flat config를 사용합니다.

## 실행 방법

```bash
cp .env.example .env.local
npm install
npm run dev
```

- 로컬: Vite가 `/api`를 `VITE_API_PROXY_TARGET`(기본 `http://127.0.0.1:8000`)으로 프록시
- Mock UI: `VITE_DATA_MODE=mock`
- 지도: `VITE_KAKAO_MAP_APP_KEY`(카카오맵 JS 키). Railway Variables에도 동일 키 등록, 카카오 콘솔에 배포 도메인 등록
- 브라우저: [http://localhost:5173](http://localhost:5173)

```bash
npm test
npm run build
npm run preview
```

## 배포 (Railway)

- `Dockerfile` + `Caddyfile` + `railway.json`
- Frontend Variables: `BACKEND_ORIGIN=https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}` (경로·trailing `/` 없음), `VITE_KAKAO_MAP_APP_KEY=` (카카오맵 JS 키, 빌드 시 주입)
- Caddy가 `/api`·`/admin`·`/static`을 백엔드로 전달하고 SPA는 `dist` 서빙
- Health: `/healthz`

## 라우트 맵

| 경로 | 화면 |
|------|------|
| `/` | 스플래시 |
| `/onboarding` | 온보딩 |
| `/setup/allergen` | 알레르겐 |
| `/setup/restriction` | 제한 재료 |
| `/setup/confirm` | 프로필 확인·저장 |
| `/explore` | 메뉴 탐색 |
| `/menu/:id` | 메뉴 상세 |
| `/menu/:id/reasoning` | 판단 근거 |
| `/menu/:id/inquiry` | 매장 문의 |
| `/menu/:id/report` | 정보 제보 |
| `/show-staff` | 직원에게 보여주기 |
| `/my` | 마이페이지 |
| `/ai` | AI 메뉴 추천 |

호환 redirect: `/profile`, `/mypage`, `/staff`, `/menus/:id` …
# 관리자 페이지

- `/manage/login`: 기존 Django 직원 계정의 이메일과 비밀번호로 로그인합니다. 이메일은 대소문자를 구분하지 않으며 중복 이메일 계정은 로그인을 거부합니다. 활성 계정과 모델별 권한이 필요합니다.
- `/manage`: 권한 범위 내 데이터 건수와 미처리 제보 현황을 표시합니다.
- `/manage/criteria`, `/manage/rules`: 기준 정보 등록·수정·비활성화와 판단 규칙 등록·수정을 제공합니다.
- 새 기준은 비활성으로 등록하고, 판단 규칙에 제외 성분 태그와 근거를 연결한 뒤 활성화합니다.
- `/manage/restaurants`, `/manage/menus`: 기존 DB 항목의 기본 정보를 수정합니다. 신규 등록, 영업시간, 옵션·성분 근거 편집은 기존 Django `/admin/`을 사용합니다.
- `/manage/reports`: 전체 제보 조회, 검토 시작, 반려, 수정 제안 반영, 수동 반영 완료를 제공합니다. 재료·알레르겐 제보는 자동 반영하지 않습니다.
- `/manage/reviews`: 리뷰 조회와 영구 삭제를 제공합니다. 숨김·복원은 아직 제공하지 않습니다.
- 관리 API는 동일 origin의 `/api/manage/*`를 사용하고 Django 세션·CSRF·모델 권한을 검사합니다.
- 사용자 화면에 DB 수정값을 반영하려면 백엔드의 `CATALOG_USE_DB=true`와 데이터 적재가 필요합니다.
- 매장·메뉴·기준·규칙 수정과 리뷰 삭제는 Django 관리자 로그에, 제보 처리는 기존 `ReportEvent`에 기록합니다.
- 관리자 계정 생성은 저장소 루트에서 `.\BE\.venv\Scripts\python.exe BE/manage.py createsuperuser`로 진행합니다.
