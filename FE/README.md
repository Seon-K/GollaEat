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
