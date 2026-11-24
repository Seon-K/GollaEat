import type { Allergen, AllergenId } from "@/types";

/** 백엔드 /api/dietary-criteria의 allergen 코드·명칭 17종과 동일한 목록. */
export const ALLERGENS: Allergen[] = [
  { id: "egg", label: "난류" },
  { id: "milk", label: "우유" },
  { id: "buckwheat", label: "메밀" },
  { id: "nuts", label: "견과류" },
  { id: "soy", label: "대두" },
  { id: "wheat", label: "밀" },
  { id: "mackerel", label: "고등어" },
  { id: "crab", label: "게" },
  { id: "shrimp", label: "새우" },
  { id: "pork", label: "돼지고기" },
  { id: "peach", label: "복숭아" },
  { id: "tomato", label: "토마토" },
  { id: "sulfites", label: "아황산류" },
  { id: "chicken", label: "닭고기" },
  { id: "beef", label: "쇠고기" },
  { id: "squid", label: "오징어" },
  { id: "shellfish", label: "조개류" },
];

const LEGACY_ALLERGEN_IDS: Record<string, string> = { peanut: "nuts", walnut: "nuts", pinenut: "nuts", sulfite: "sulfites" };
const VALID_ALLERGEN_IDS = new Set(ALLERGENS.map((item) => item.id));

export const allergenLabel = (id: string): string =>
  ALLERGENS.find((a) => a.id === (LEGACY_ALLERGEN_IDS[id] ?? id))?.label ?? id;

export const allergenByLabel = (label: string): Allergen | undefined =>
  ALLERGENS.find((a) => allergenSearchLabels(a.id).includes(label));


/** Normalize persisted IDs from the former 19-item UI without losing restrictions. */
export function normalizeAllergenIds(ids: readonly string[]): AllergenId[] {
  return [...new Set(ids.map((id) => LEGACY_ALLERGEN_IDS[id] ?? id))].filter((id): id is AllergenId => VALID_ALLERGEN_IDS.has(id as AllergenId));
}

/** Mock search aliases follow the backend's grouped nuts condition. */
export const allergenSearchLabels = (id: AllergenId): string[] =>
  id === "nuts" ? ["견과류", "땅콩", "호두", "잣"] : [allergenLabel(id)];
