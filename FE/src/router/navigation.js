// Link, NavLink, useNavigate에서 공유할 경로입니다.
export const paths = {
  home: '/',
  welcome: '/',
  introduction: '/introduction',
  introductionMenu: '/introduction-menu',
  introductionChoice: '/introduction-choice',
  allergens: '/allergens',
  ingredients: '/ingredients',
  profileConfirm: '/profile-confirm',
  explore: '/explore',
  menuDetail: '/menu-detail',
  evidence: '/evidence',
  report: '/report',
  inquiry: '/inquiry',
  myPage: '/my-page',
  staffCard: '/staff-card',
  aiChat: '/ai-chat',
  aiResults: '/ai-results',
  aiFollowUp: '/ai-follow-up',
}

export const mainNavigation = [
  { label: '탐색', to: paths.explore },
  { label: '마이', to: paths.myPage },
]

export const onboardingNavigation = [
  paths.introduction,
  paths.introductionMenu,
  paths.introductionChoice,
  paths.allergens,
  paths.ingredients,
  paths.profileConfirm,
  paths.explore,
]
