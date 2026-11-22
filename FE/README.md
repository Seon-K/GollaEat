# 골라잇 (GollaEat) — FE (Next.js)

알레르기·채식·개인 식이 제한이 있는 사용자가 **메뉴 단위**로 먹을 수 있는지 판단받는 모바일 웹앱입니다.  
모노레포에서는 [`Seon-K/GollaEat`](https://github.com/Seon-K/GollaEat)의 `FE/` 디렉터리에 해당합니다.

## 실행 방법

```bash
cp .env.example .env.local   # BACKEND_URL 등 설정
npm install
npm run dev
```

- **API 모드(기본):** `NEXT_PUBLIC_DATA_MODE` 미설정 또는 `api` → `/api/*` Route Handler가 `BACKEND_URL`로 프록시
- **Mock 모드:** `NEXT_PUBLIC_DATA_MODE=mock` → `/src/data` mock (백엔드 없이 UI 확인)

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다.  
데스크톱에서는 최대 너비 **430px** 폰 프레임으로 중앙 정렬됩니다. (기준 프레임 390×844)

```bash
npm test          # vitest
npm run lint      # eslint
npx tsc --noEmit  # 타입체크
npm run build     # 프로덕션 빌드
npm run smoke:api # 백엔드 스모크 (BACKEND_URL 필요)
```

## 라우트 맵

| 경로 | 화면 |
|------|------|
| `/` | 스플래시(시작하기) |
| `/onboarding` | 온보딩 3장 |
| `/setup/allergen` | 프로필 1/3 알레르겐 |
| `/setup/restriction` | 프로필 2/3 제한 재료 |
| `/setup/confirm` | 프로필 3/3 확인·저장 |
| `/explore` | 메뉴 탐색 |
| `/menu/[id]` | 메뉴 상세 |
| `/menu/[id]/reasoning` | 판단 근거 |
| `/menu/[id]/inquiry` | 매장 문의 문구 |
| `/menu/[id]/report` | 정보 오류 제보 |
| `/show-staff` | 직원에게 보여주기 (`?menuId=` 선택) |
| `/my` | 마이페이지 |
| `/ai` | AI 메뉴 추천 (`POST /api/chat`) |
| `/design-system` | 디자인 토큰·컴포넌트 갤러리 |

### 호환 리다이렉트

| 구 경로 | 이동 |
|---------|------|
| `/profile` | `/setup/allergen` |
| `/menus/[id]` … | `/menu/[id]` … |
| `/mypage` | `/my` |
| `/staff` | `/show-staff` |

### 주요 플로우

1. 스플래시 → 온보딩 → 프로필 3단계 → 탐색  
2. 탐색 → 메뉴 상세 → 판단 근거 / 제보 / 직원에게 보여주기 / 문의  
3. 탐색 → AI → 메뉴 상세 (뒤로가기는 history)  
4. 마이 → 프로필 수정(`?from=my`) → 저장 후 `/my` 복귀  

## Mock 데이터 수정

| 파일 | 내용 |
|------|------|
| `src/data/mock.ts` | 매장·메뉴·리뷰, `ASAN_ORIGIN` / `SCH_ORIGIN` / `ONYANG_ORIGIN`, `DEMO_PROFILE` |
| `src/data/allergens.ts` | 알레르겐 19종 |
| `src/data/restrictions.ts` | 제한 재료·카테고리 확장 맵 |
| `src/lib/judge.ts` | 판정 엔진 (`match` / `check` / `mismatch`) |
| `src/lib/aiEngine.ts` | AI: `parseIntent` → `search` → `buildResponse` |

### 프로필·저장 상태

- `src/store/profileStore.ts` — 식이 프로필 (persist: `gollaeat-profile`)  
  초기값은 디자인 데모용 `DEMO_PROFILE`(땅콩·우유·새우 + 소고기·돼지고기·동물성 육수)입니다.  
- `src/store/savedMenusStore.ts` — 저장 메뉴  
- `src/store/reviewStore.ts` — 리뷰  

새 메뉴를 추가할 때:

1. `STORES`에 매장 좌표 추가 (탐색·AI 거리 수치에 맞게)  
2. `MENUS`에 `confirmedIngredients` / `confirmedAllergens` / `unconfirmed` / `hasIngredientInfo` 설정  
3. `npm test`로 판정·거리 스냅샷 확인  

### 판정 규칙 (요약)

- 우선순위: **mismatch > check > match**  
- 제한 성분이 확인 재료·알레르겐에 있으면 mismatch  
- 재료 정보 없음 또는 미확인(소스·육수 등)이면 check  
- 모두 확인되고 제한 성분 없으면 match  
- “안전하다” 표현 금지 — 항상 확인된 재료 정보 기준  

### 디자인

`design/p01.png` ~ `p22.png` (및 `골라잇.pdf`)가 화면 기준입니다.  
토큰은 `tailwind.config.ts` / `src/app/globals.css` `@theme` 에 정의합니다.
