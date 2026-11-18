import { createBrowserRouter } from 'react-router-dom'
import Welcome from '../pages/Welcome'
import Introduction from '../pages/Introduction'
import IntroductionMenu from '../pages/IntroductionMenu'
import IntroductionChoice from '../pages/IntroductionChoice'
import Allergens from '../pages/Allergens'
import Ingredients from '../pages/Ingredients'
import ProfileConfirm from '../pages/ProfileConfirm'
import Explore from '../pages/Explore'
import MenuDetail from '../pages/MenuDetail'
import Evidence from '../pages/Evidence'
import Report from '../pages/Report'
import Inquiry from '../pages/Inquiry'
import MyPage from '../pages/MyPage'
import StaffCard from '../pages/StaffCard'
import AiChat from '../pages/AiChat'
import AiResults from '../pages/AiResults'
import AiFollowUp from '../pages/AiFollowUp'
import NotFound from '../pages/NotFound'
import {
  homeLoader, requireDietProfile, profileSetupLoader, ingredientsLoader, confirmProfileLoader,
  introductionAction, allergensAction, ingredientsAction, profileConfirmAction,
} from './session'

// 화면 구현 없이 페이지 경로와 컴포넌트만 연결합니다.
export const routes = [
  { path: '/', loader: homeLoader, Component: Welcome, handle: { title: '시작하기' } },
  { path: '/introduction', Component: Introduction, handle: { title: '서비스 소개 · 식이 조건' } },
  { path: '/introduction-menu', Component: IntroductionMenu, handle: { title: '서비스 소개 · 메뉴별 정보' } },
  { path: '/introduction-choice', action: introductionAction, Component: IntroductionChoice, handle: { title: '서비스 소개 · 확인과 선택' } },
  { path: '/allergens', loader: profileSetupLoader, action: allergensAction, Component: Allergens, handle: { title: '알레르겐 설정' } },
  { path: '/ingredients', loader: ingredientsLoader, action: ingredientsAction, Component: Ingredients, handle: { title: '제한 식재료 설정' } },
  { path: '/profile-confirm', loader: confirmProfileLoader, action: profileConfirmAction, Component: ProfileConfirm, handle: { title: '식이 프로필 확인' } },
  { path: '/explore', loader: requireDietProfile, Component: Explore, handle: { title: '메뉴 탐색' } },
  { path: '/menu-detail', loader: requireDietProfile, Component: MenuDetail, handle: { title: '메뉴 상세' } },
  { path: '/evidence', loader: requireDietProfile, Component: Evidence, handle: { title: '판단 근거' } },
  { path: '/report', loader: requireDietProfile, Component: Report, handle: { title: '정보 오류 제보' } },
  { path: '/inquiry', loader: requireDietProfile, Component: Inquiry, handle: { title: '매장 문의' } },
  { path: '/my-page', loader: requireDietProfile, Component: MyPage, handle: { title: '마이페이지' } },
  { path: '/staff-card', loader: requireDietProfile, Component: StaffCard, handle: { title: '직원에게 보여주기' } },
  { path: '/ai-chat', loader: requireDietProfile, Component: AiChat, handle: { title: 'AI 메뉴 추천' } },
  { path: '/ai-results', loader: requireDietProfile, Component: AiResults, handle: { title: 'AI 추천 결과' } },
  { path: '/ai-follow-up', loader: requireDietProfile, Component: AiFollowUp, handle: { title: 'AI 후속 질문' } },
  { path: '*', Component: NotFound, handle: { title: '페이지 없음' } },
]

export const router = createBrowserRouter(routes)
