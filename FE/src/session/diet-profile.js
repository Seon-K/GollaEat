export const SESSION_KEY = 'gollaeat.session'

const emptyProfile = () => ({ allergens: [], ingredients: [] })
const emptySession = () => ({ introductionCompleted: false, profile: null, draft: null })
const isList = value => Array.isArray(value) && value.every(item => typeof item === 'string')
const isProfile = value => value && isList(value.allergens) && isList(value.ingredients)
const copyProfile = profile => ({
  allergens: [...new Set(profile.allergens)],
  ingredients: [...new Set(profile.ingredients)],
})

// 세션 API 연결 전의 브라우저 세션 어댑터입니다.
// 항목 수 대신 profile 존재 여부로 설정 완료를 판단합니다.
export function readSession() {
  let session
  try {
    session = JSON.parse(window.sessionStorage.getItem(SESSION_KEY))
  } catch {
    return emptySession()
  }
  if (!session || typeof session !== 'object') return emptySession()
  return {
    introductionCompleted: session.introductionCompleted === true,
    profile: isProfile(session.profile) ? copyProfile(session.profile) : null,
    draft: isProfile(session.draft) ? copyProfile(session.draft) : null,
  }
}

function writeSession(session) {
  // 저장 실패를 성공으로 처리하지 않도록 오류는 호출부에 전달합니다.
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function completeIntroduction() {
  return writeSession({ ...readSession(), introductionCompleted: true })
}

export function readProfileDraft() {
  const session = readSession()
  return session.draft ?? session.profile ?? emptyProfile()
}

export function updateProfileDraft(group, values) {
  if (!['allergens', 'ingredients'].includes(group) || !isList(values)) {
    throw new TypeError('유효한 식이 프로필 항목이 필요합니다.')
  }
  const session = readSession()
  return writeSession({
    ...session,
    draft: copyProfile({ ...readProfileDraft(), [group]: values }),
  })
}

export function saveDietProfile() {
  const session = readSession()
  if (!session.draft) throw new Error('저장할 식이 프로필 초안이 없습니다.')
  return writeSession({
    introductionCompleted: true,
    profile: copyProfile(session.draft),
    draft: null,
  })
}
