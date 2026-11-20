# 프론트엔드 기초 설정

페이지 UI는 구현하지 않았으며, 각 `src/pages/<페이지>/index.jsx`는 빈 컴포넌트입니다.

## 세션에 따른 진입 경로

- `/`: 저장한 식이 프로필이 있으면 `/explore`, 없으면 `/introduction`으로 이동합니다.
- 소개를 완료했지만 프로필을 저장하지 않았다면 `/allergens`로 이동합니다.
- 프로필 없이 탐색·메뉴 상세·마이페이지·AI 경로에 직접 접근해도 소개 또는 프로필 설정으로 이동합니다.
- 선택 항목이 0개여도 최종 저장했다면 프로필 설정을 완료한 사용자입니다.

현재 백엔드에 프로필 세션 API가 없어 `sessionStorage`의 `gollaeat.session`을 사용합니다.
같은 탭에서 새로고침하면 유지되며, 브라우저 세션이 끝나면 다시 설정해야 합니다.
서버 세션 연동 시 `src/session/diet-profile.js`와 라우트 loader/action을 API 호출로 교체합니다.

## 이후 UI 연결 방법

React Router의 `Link`로 소개 화면을 순서대로 연결하고, 다음 단계에서 `Form method="post"`를 사용합니다.
각 action은 세션을 저장한 뒤 다음 경로로 redirect합니다.

| 페이지 | POST 데이터 | 다음 경로 |
| --- | --- | --- |
| `/introduction-choice` | 없음 | `/allergens` |
| `/allergens` | 선택한 `allergens` 필드 (복수 가능) | `/ingredients` |
| `/ingredients` | 선택한 `ingredients` 필드 (복수 가능) | `/profile-confirm` |
| `/profile-confirm` | 없음 | `/explore` |

설정 페이지에서는 `useLoaderData().profile`로 초안/기존 선택값을 읽습니다.
탐색 등 프로필이 필요한 페이지에서는 `useLoaderData().profile`로 저장 완료된 프로필을 읽습니다.
항목이 없으면 해당 필드를 보내지 않으면 됩니다. 수정 중 초안은 최종 저장 전까지 기존 프로필과 분리됩니다.
라우팅은 재료 안전성을 판정하지 않으며, 추후 추천 API에 전달할 프로필과 진입 조건만 관리합니다.

## 검증

```powershell
node --test tests/session-routing.test.js
npm run build
```
