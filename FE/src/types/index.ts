/** 판정 상태 3종 — mismatch > check > match */
export type JudgementStatus = "match" | "check" | "mismatch";

/** @deprecated JudgementStatus 사용 */
export type VerdictStatus = JudgementStatus;

export type AllergenId =
  | "egg"
  | "milk"
  | "buckwheat"
  | "peanut"
  | "soy"
  | "wheat"
  | "mackerel"
  | "crab"
  | "shrimp"
  | "pork"
  | "peach"
  | "tomato"
  | "sulfite"
  | "walnut"
  | "chicken"
  | "beef"
  | "squid"
  | "shellfish"
  | "pinenut";

export type RestrictionId =
  | "beef"
  | "pork"
  | "chicken"
  | "other_meat"
  | "fish"
  | "crustacean"
  | "shellfish"
  | "egg"
  | "milk"
  | "cheese_butter"
  | "honey"
  | "gelatin"
  | "animal_broth";

export type RestrictionCategory =
  | "육류"
  | "해산물"
  | "달걀 · 유제품"
  | "기타 동물성 재료";

export interface Allergen {
  id: AllergenId;
  label: string;
}

export interface RestrictedIngredient {
  id: RestrictionId;
  label: string;
  category: RestrictionCategory;
}

export interface DietProfile {
  allergens: AllergenId[];
  restrictions: RestrictionId[];
}

/** @deprecated DietProfile 사용 */
export type DietaryProfile = DietProfile & { completed?: boolean };

export interface Store {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  category: string;
}

export interface Menu {
  id: string;
  storeId: string;
  name: string;
  price: number;
  category: string;
  confirmedIngredients: string[];
  confirmedAllergens: string[];
  /** 미확인 항목 예: '소스', '육수' */
  unconfirmed: string[];
  hasIngredientInfo: boolean;
  source: string;
  verifiedAt: string;
}

export type ReasonResult =
  | "포함 정보 없음 · 재료 정보 확인"
  | "사용하지 않는 것으로 확인"
  | "포함 확인됨"
  | "정보 없음";

export interface JudgementReason {
  condition: string;
  result: ReasonResult;
}

export interface Judgement {
  status: JudgementStatus;
  reasons: JudgementReason[];
}

/** UI용 판정 뷰모델 (judge → evaluateMenu 어댑터) */
export interface VerdictResult {
  status: JudgementStatus;
  title: string;
  description: string;
  matchedRestrictions: string[];
  unknownItems: string[];
  perCondition: Array<{
    label: string;
    detail: string;
    status: JudgementStatus;
  }>;
}

export interface Review {
  id: string;
  menuId: string;
  author: string;
  restrictionLabel: string;
  content: string;
  avatarTone: "mint" | "peach";
  createdAt: string;
}

export type SortOption =
  | "recommend"
  | "match"
  | "price_asc"
  | "price_desc"
  | "review";

export type CategoryFilter =
  | "all"
  | "korean"
  | "chinese"
  | "japanese"
  | "western"
  | "snack"
  | "cafe";

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}
