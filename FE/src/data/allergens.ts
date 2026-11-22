import type { Allergen } from "@/types";

/** 알레르기 유발물질 19종 — p07 그리드 순서 */
export const ALLERGENS: Allergen[] = [
  { id: "egg", label: "난류" },
  { id: "milk", label: "우유" },
  { id: "buckwheat", label: "메밀" },
  { id: "peanut", label: "땅콩" },
  { id: "soy", label: "대두" },
  { id: "wheat", label: "밀" },
  { id: "mackerel", label: "고등어" },
  { id: "crab", label: "게" },
  { id: "shrimp", label: "새우" },
  { id: "pork", label: "돼지고기" },
  { id: "peach", label: "복숭아" },
  { id: "tomato", label: "토마토" },
  { id: "sulfite", label: "아황산류" },
  { id: "walnut", label: "호두" },
  { id: "chicken", label: "닭고기" },
  { id: "beef", label: "쇠고기" },
  { id: "squid", label: "오징어" },
  { id: "shellfish", label: "조개류" },
  { id: "pinenut", label: "잣" },
];

export const allergenLabel = (id: string): string =>
  ALLERGENS.find((a) => a.id === id)?.label ?? id;

export const allergenByLabel = (label: string): Allergen | undefined =>
  ALLERGENS.find((a) => a.label === label);
