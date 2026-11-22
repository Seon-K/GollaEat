# GollaEat FE

React + TypeScript + Vite + React Router + Tailwind.

- 판정은 서버 API 결과만 사용 (`match` / `check` / `mismatch`)
- 브라우저는 같은 origin `/api/*`만 호출 (로컬: Vite proxy, 배포: Caddy → `BACKEND_ORIGIN`)
- `analysis_reference`는 UI·판정에 사용하지 않음
