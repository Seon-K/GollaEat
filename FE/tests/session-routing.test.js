import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SESSION_KEY, readSession, readProfileDraft, updateProfileDraft,
} from '../src/session/diet-profile.js'
import {
  homeLoader, requireDietProfile, profileSetupLoader, ingredientsLoader,
  confirmProfileLoader, introductionAction, allergensAction,
  ingredientsAction, profileConfirmAction,
} from '../src/router/session.js'

beforeEach(() => {
  const values = new Map()
  globalThis.window = {
    sessionStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  }
})

const destination = response => response.headers.get('Location')
const redirectsTo = (loader, path) => assert.throws(loader, response => response instanceof Response && destination(response) === path)
function requestWith(key, values) {
  const form = new FormData()
  values.forEach(value => form.append(key, value))
  return { request: new Request('http://localhost/setup', { method: 'POST', body: form }) }
}

test('첫 방문은 소개로 진입하며 탐색·설정 직접 접근을 막는다', () => {
  assert.equal(destination(homeLoader()), '/introduction')
  redirectsTo(requireDietProfile, '/introduction')
  redirectsTo(profileSetupLoader, '/introduction')
})

test('소개 완료 후 프로필이 없으면 설정으로 진입한다', () => {
  assert.equal(destination(introductionAction()), '/allergens')
  assert.equal(destination(homeLoader()), '/allergens')
  redirectsTo(requireDietProfile, '/allergens')
  redirectsTo(ingredientsLoader, '/allergens')
  redirectsTo(confirmProfileLoader, '/allergens')
})

test('초안 선택 → 최종 저장 → 탐색, 이후 방문은 탐색이 홈이다', async () => {
  introductionAction()
  assert.equal(destination(await allergensAction(requestWith('allergens', ['우유', '땅콩']))), '/ingredients')
  assert.equal(destination(await ingredientsAction(requestWith('ingredients', ['소고기']))), '/profile-confirm')
  assert.equal(readSession().profile, null)
  redirectsTo(requireDietProfile, '/allergens')
  assert.deepEqual(confirmProfileLoader().profile, { allergens: ['우유', '땅콩'], ingredients: ['소고기'] })
  assert.equal(destination(profileConfirmAction()), '/explore')
  assert.equal(destination(homeLoader()), '/explore')
  assert.deepEqual(requireDietProfile().profile, { allergens: ['우유', '땅콩'], ingredients: ['소고기'] })
  assert.equal(readSession().draft, null)
})

test('제한 항목이 없는 사용자도 명시적으로 저장하면 설정 완료다', async () => {
  introductionAction()
  await allergensAction(requestWith('allergens', []))
  await ingredientsAction(requestWith('ingredients', []))
  profileConfirmAction()
  assert.equal(destination(homeLoader()), '/explore')
  assert.deepEqual(requireDietProfile().profile, { allergens: [], ingredients: [] })
})

test('기존 프로필 수정 초안은 최종 저장 전까지 원본을 바꾸지 않는다', async () => {
  introductionAction()
  await allergensAction(requestWith('allergens', ['우유']))
  await ingredientsAction(requestWith('ingredients', []))
  profileConfirmAction()
  updateProfileDraft('allergens', ['땅콩', '땅콩'])
  assert.deepEqual(readProfileDraft().allergens, ['땅콩'])
  assert.deepEqual(requireDietProfile().profile.allergens, ['우유'])
  assert.equal(destination(homeLoader()), '/explore')
  profileConfirmAction()
  assert.deepEqual(requireDietProfile().profile.allergens, ['땅콩'])
})

test('깨진 세션 및 잘못된 프로필은 첫 방문으로 처리한다', () => {
  for (const value of ['{broken', 'null', '{"profile":{}}', '{"profile":{"allergens":"우유","ingredients":[]}}']) {
    window.sessionStorage.setItem(SESSION_KEY, value)
    assert.equal(destination(homeLoader()), '/introduction')
  }
})

test('세션 저장 실패 시 탐색으로 성공 이동하지 않는다', () => {
  introductionAction()
  updateProfileDraft('allergens', [])
  window.sessionStorage.setItem = () => { throw new Error('저장 불가') }
  assert.throws(profileConfirmAction, /저장 불가/)
  assert.equal(readSession().profile, null)
})
