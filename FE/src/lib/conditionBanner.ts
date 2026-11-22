import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import type { AllergenId, RestrictionId } from "@/types";

/** 적용 조건 배너: 알레르겐 앞 3개 + 나머지 개수 */
export function formatConditionBanner(
  allergens: AllergenId[],
  restrictions: RestrictionId[],
): string {
  const allergenLabels = allergens.map(allergenLabel);
  const shown = allergenLabels.slice(0, 3);
  const total = allergens.length + restrictions.length;
  const rest = Math.max(0, total - shown.length);

  if (shown.length === 0 && restrictions.length === 0) {
    return "적용 조건 없음";
  }

  if (shown.length === 0) {
    const fromRestrictions = restrictions.map(restrictionLabel).slice(0, 3);
    const rRest = Math.max(0, restrictions.length - fromRestrictions.length);
    return rRest > 0
      ? `적용 조건 ${fromRestrictions.join(" · ")} 외 ${rRest}개`
      : `적용 조건 ${fromRestrictions.join(" · ")}`;
  }

  return rest > 0
    ? `적용 조건 ${shown.join(" · ")} 외 ${rest}개`
    : `적용 조건 ${shown.join(" · ")}`;
}
