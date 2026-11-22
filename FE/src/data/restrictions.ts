import type {
  RestrictedIngredient,
  RestrictionCategory,
  RestrictionId,
} from "@/types";

/** p08 카테고리 구조 */
export const RESTRICTIONS: RestrictedIngredient[] = [
  { id: "beef", label: "소고기", category: "육류" },
  { id: "pork", label: "돼지고기", category: "육류" },
  { id: "chicken", label: "닭고기", category: "육류" },
  { id: "other_meat", label: "기타 육류", category: "육류" },
  { id: "fish", label: "생선", category: "해산물" },
  { id: "crustacean", label: "갑각류", category: "해산물" },
  { id: "shellfish", label: "조개류", category: "해산물" },
  { id: "egg", label: "달걀", category: "달걀 · 유제품" },
  { id: "milk", label: "우유", category: "달걀 · 유제품" },
  { id: "cheese_butter", label: "치즈·버터", category: "달걀 · 유제품" },
  { id: "honey", label: "꿀", category: "기타 동물성 재료" },
  { id: "gelatin", label: "젤라틴", category: "기타 동물성 재료" },
  { id: "animal_broth", label: "동물성 육수", category: "기타 동물성 재료" },
];

export const RESTRICTION_CATEGORIES: RestrictionCategory[] = [
  "육류",
  "해산물",
  "달걀 · 유제품",
  "기타 동물성 재료",
];

/**
 * 카테고리/항목 확장 맵
 * 제한 재료 선택 시 실제 매칭에 사용할 동의어·하위 성분
 */
export const RESTRICTION_EXPANSION: Record<RestrictionId, string[]> = {
  beef: ["소고기", "쇠고기", "우육", "beef"],
  pork: ["돼지고기", "돈육", "pork"],
  chicken: ["닭고기", "계육", "chicken"],
  other_meat: ["소고기", "쇠고기", "돼지고기", "닭고기", "육류", "고기"],
  fish: ["생선", "고등어", "참치", "연어", "생선살"],
  crustacean: ["갑각류", "새우", "게", "lobster", "shrimp", "crab"],
  shellfish: ["조개류", "조개", "홍합", "굴", "전복"],
  egg: ["달걀", "계란", "난류", "egg"],
  milk: ["우유", "유제품", "milk"],
  cheese_butter: ["치즈", "버터", "유제품", "우유", "cheese", "butter"],
  honey: ["꿀", "honey"],
  gelatin: ["젤라틴", "gelatin"],
  animal_broth: ["동물성 육수", "육수", "사골", "닭육수", "육수"],
};

export const restrictionLabel = (id: string): string =>
  RESTRICTIONS.find((r) => r.id === id)?.label ?? id;

/** @deprecated RestrictedIngredient 사용 */
export type RestrictionItem = RestrictedIngredient;
