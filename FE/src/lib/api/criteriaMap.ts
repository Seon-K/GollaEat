/**
 * 로컬 DietProfile id ↔ 서버 dietary-criteria code 매핑
 * 근거: docs/api-samples/get_dietary_criteria.json
 */
import type { AllergenId, DietProfile, RestrictionId } from "@/types";

const ALLERGEN_TO_CODE: Partial<Record<AllergenId, string>> = {
  egg: "allergen-egg",
  milk: "allergen-milk",
  buckwheat: "allergen-buckwheat",
  peanut: "allergen-nuts",
  walnut: "allergen-nuts",
  pinenut: "allergen-nuts",
  soy: "allergen-soy",
  wheat: "allergen-wheat",
  mackerel: "allergen-mackerel",
  crab: "allergen-crab",
  shrimp: "allergen-shrimp",
  pork: "allergen-pork",
  peach: "allergen-peach",
  tomato: "allergen-tomato",
  sulfite: "allergen-sulfites",
  chicken: "allergen-chicken",
  beef: "allergen-beef",
  squid: "allergen-squid",
  shellfish: "allergen-shellfish",
};

const CODE_TO_ALLERGEN: Record<string, AllergenId> = {
  "allergen-egg": "egg",
  "allergen-milk": "milk",
  "allergen-buckwheat": "buckwheat",
  "allergen-nuts": "peanut",
  "allergen-soy": "soy",
  "allergen-wheat": "wheat",
  "allergen-mackerel": "mackerel",
  "allergen-crab": "crab",
  "allergen-shrimp": "shrimp",
  "allergen-pork": "pork",
  "allergen-peach": "peach",
  "allergen-tomato": "tomato",
  "allergen-sulfites": "sulfite",
  "allergen-chicken": "chicken",
  "allergen-beef": "beef",
  "allergen-squid": "squid",
  "allergen-shellfish": "shellfish",
};

const RESTRICTION_TO_CODE: Partial<Record<RestrictionId, string>> = {
  beef: "exclude-beef",
  pork: "exclude-pork",
  chicken: "exclude-chicken",
  other_meat: "exclude-other-meat",
  fish: "exclude-fish",
  crustacean: "exclude-crustacean",
  shellfish: "exclude-shellfish",
  egg: "exclude-egg",
  milk: "exclude-milk",
  cheese_butter: "exclude-cheese-butter",
  honey: "exclude-honey",
  gelatin: "exclude-gelatin",
  // animal_broth: 서버 criteria 샘플에 없음 — 전송하지 않음
};

const CODE_TO_RESTRICTION: Record<string, RestrictionId> = {
  "exclude-beef": "beef",
  "exclude-pork": "pork",
  "exclude-chicken": "chicken",
  "exclude-other-meat": "other_meat",
  "exclude-fish": "fish",
  "exclude-crustacean": "crustacean",
  "exclude-shellfish": "shellfish",
  "exclude-egg": "egg",
  "exclude-milk": "milk",
  "exclude-cheese-butter": "cheese_butter",
  "exclude-honey": "honey",
  "exclude-gelatin": "gelatin",
};

/** Zustand 프로필 → 서버 criteria 코드 */
export function profileToCriteriaCodes(profile: DietProfile): string[] {
  const codes = new Set<string>();
  for (const id of profile.allergens) {
    const code = ALLERGEN_TO_CODE[id];
    if (code) codes.add(code);
  }
  for (const id of profile.restrictions) {
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
