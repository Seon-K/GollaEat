import { redirect } from 'react-router-dom'
import { paths } from './navigation.js'
import {
  completeIntroduction,
  readSession,
  readProfileDraft,
  updateProfileDraft,
  saveDietProfile,
} from '../session/diet-profile.js'

export function homeLoader() {
  const { profile, introductionCompleted } = readSession()
  return redirect(profile ? paths.explore : introductionCompleted ? paths.allergens : paths.introduction)
}

export function requireDietProfile() {
  const { profile, introductionCompleted } = readSession()
  if (!profile) throw redirect(introductionCompleted ? paths.allergens : paths.introduction)
  return { profile }
}

export function profileSetupLoader() {
  const session = readSession()
  if (!session.profile && !session.introductionCompleted) throw redirect(paths.introduction)
  return { profile: readProfileDraft() }
}

export function confirmProfileLoader() {
  const result = profileSetupLoader()
  if (!readSession().draft) throw redirect(paths.allergens)
  return result
}

export function ingredientsLoader() {
  return confirmProfileLoader()
}

export function introductionAction() {
  completeIntroduction()
  return redirect(paths.allergens)
}

export async function allergensAction({ request }) {
  profileSetupLoader()
  const form = await request.formData()
  updateProfileDraft('allergens', form.getAll('allergens'))
  return redirect(paths.ingredients)
}

export async function ingredientsAction({ request }) {
  profileSetupLoader()
  if (!readSession().draft) throw redirect(paths.allergens)
  const form = await request.formData()
  updateProfileDraft('ingredients', form.getAll('ingredients'))
  return redirect(paths.profileConfirm)
}

export function profileConfirmAction() {
  confirmProfileLoader()
  saveDietProfile()
  return redirect(paths.explore)
}
