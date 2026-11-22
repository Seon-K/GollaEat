import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import type { AllergenId, RestrictionId } from "@/types";

export interface InquiryContext {
  storeName: string;
  menuName: string;
  allergens: AllergenId[];
  restrictions: RestrictionId[];
}

/** 성분 나열: 알레르겐, 알레르겐 및 제한, 제한 */
export function formatRestrictedIngredients(
  allergens: AllergenId[],
  restrictions: RestrictionId[],
): string {
  const a = allergens.map(allergenLabel);
  const r = restrictions.map(restrictionLabel);
  if (a.length && r.length) return `${a.join(", ")} 및 ${r.join(", ")}`;
  if (a.length) return a.join(", ");
  if (r.length) return r.join(", ");
  return "제한 성분";
}

/**
 * 매장 문의 문구 생성 — 문의 화면 공통
 */
export function buildInquiryMessage(ctx: InquiryContext): string {
  const ingredients = formatRestrictedIngredients(
    ctx.allergens,
    ctx.restrictions,
  );
  return `안녕하세요. ${ctx.storeName}의 ${ctx.menuName} 주문 전에 ${ingredients} 등 제한 성분의 포함 여부를 확인하고 싶습니다. 공개 재료 외 소스·드레싱의 상세 성분도 알려주실 수 있을까요?`;
}

/**
 * AI 화면용 직원 확인 문구 (p22)
 * 예: 참치김밥 + 땅콩, 우유, 새우, 소고기 …
 */
export function buildAiStaffPhrase(
  menuName: string,
  allergens: AllergenId[],
  restrictions: RestrictionId[],
): string {
  const labels = [
    ...allergens.map(allergenLabel),
    ...restrictions.map(restrictionLabel),
  ];
  const ingredients = labels.length ? labels.join(", ") : "제한";
  return `안녕하세요. ${menuName} 주문 전에 ${ingredients} 관련 성분이 포함되는지 확인하고 싶습니다. 사용된 소스와 가공재료의 성분도 확인 부탁드립니다.`;
}

/** 직원 화면용 알레르겐/제한 재료 · 구분 문자열 */
export function joinWithDot(labels: string[]): string {
  return labels.length ? labels.join(" · ") : "없음";
}
