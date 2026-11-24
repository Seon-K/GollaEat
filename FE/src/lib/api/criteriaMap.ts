import { RESTRICTIONS, normalizeRestrictionIds } from "@/data/restrictions";
import { ALLERGENS, normalizeAllergenIds } from "@/data/allergens";
/**
 * 로컬 DietProfile id ↔ 서버 dietary-criteria code 매핑
 * 근거: docs/api-samples/get_dietary_criteria.json
 */
import type { AllergenId, DietProfile, RestrictionId } from "@/types";

const ALLERGEN_TO_CODE = Object.fromEntries(
  ALLERGENS.map(({ id }) => [id, `allergen-${id}`]),
) as Record<AllergenId, string>;
const CODE_TO_ALLERGEN = Object.fromEntries(
  ALLERGENS.map(({ id }) => [`allergen-${id}`, id]),
) as Record<string, AllergenId>;

const RESTRICTION_TO_CODE = Object.fromEntries(
  RESTRICTIONS.map(({ id }) => [id, `exclude-${id.replaceAll("_", "-")}`]),
) as Record<RestrictionId, string>;
const CODE_TO_RESTRICTION = Object.fromEntries(
  RESTRICTIONS.map(({ id }) => [`exclude-${id.replaceAll("_", "-")}`, id]),
) as Record<string, RestrictionId>;

/** Zustand 프로필 → 서버 criteria 코드 */
export function profileToCriteriaCodes(profile: DietProfile): string[] {
  const codes = new Set<string>();
  for (const id of normalizeAllergenIds(profile.allergens)) {
    const code = ALLERGEN_TO_CODE[id];
    if (code) codes.add(code);
  }
  for (const id of normalizeRestrictionIds(profile.restrictions)) {
    const code = RESTRICTION_TO_CODE[id];
    if (code) codes.add(code);
  }
  return [...codes];
}

/** 서버 criteria → 로컬 DietProfile */
export function criteriaCodesToProfile(codes: string[]): DietProfile {
  const allergens: AllergenId[] = [];
  const restrictions: RestrictionId[] = [];
  for (const code of codes) {
    const a = CODE_TO_ALLERGEN[code];
    if (a && !allergens.includes(a)) allergens.push(a);
    const r = CODE_TO_RESTRICTION[code];
    if (r && !restrictions.includes(r)) restrictions.push(r);
  }
  return { allergens, restrictions };
}

/** 탐색 필터 id → 서버 category 한글 라벨 */
export const CATEGORY_FILTER_LABEL: Record<string, string> = {
  korean: "한식",
  chinese: "중식",
  japanese: "일식",
  western: "양식",
  snack: "분식",
  cafe: "카페",
};
