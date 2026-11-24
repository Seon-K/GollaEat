/**
 * UI 호환 레이어 — 도메인 판정은 judge.ts 사용
 */
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { VERDICT_COPY } from "@/lib/verdictCopy";
import { judgeMenu, reasonResultToTone } from "@/lib/judge";
import { formatDistance, formatPrice } from "@/lib/geo";
import type {
  AllergenId,
  DietProfile,
  DietaryProfile,
  Menu,
  RestrictionId,
  VerdictResult,
  VerdictStatus,
} from "@/types";

export { formatDistance, formatPrice };
export { judgeMenu } from "@/lib/judge";
export { haversineKm, distanceFrom } from "@/lib/geo";

export function evaluateMenu(
  menu: Menu,
  profile: DietProfile | DietaryProfile,
): VerdictResult {
  const diet: DietProfile = {
    allergens: profile.allergens,
    restrictions: profile.restrictions,
  };
  const judgement = judgeMenu(menu, diet);
  const copy = VERDICT_COPY[judgement.status];

  return {
    status: judgement.status,
    title: copy.title,
    description:
      judgement.status === "check" && !menu.hasIngredientInfo
        ? "재료 정보 없음 · 매장 확인 필요"
        : copy.description,
    matchedRestrictions: judgement.reasons
      .filter((r) => r.result === "포함 확인됨")
      .map((r) => r.condition),
    unknownItems: menu.unconfirmed,
    perCondition: judgement.reasons.map((r) => ({
      label: r.condition,
      detail: r.result,
      status: reasonResultToTone(r.result),
    })),
  };
}

export function profileSummaryLabels(profile: DietProfile): string[] {
  return [
    ...profile.allergens.map((id: AllergenId) => allergenLabel(id)),
    ...profile.restrictions.map((id: RestrictionId) => restrictionLabel(id)),
  ];
}

export function statusBadgeClass(status: VerdictStatus): string {
  switch (status) {
    case "match":
      return "bg-primary-light text-primary";
    case "check":
      return "bg-accent-light text-accent-text";
    case "mismatch":
      return "bg-error-light text-error";
  }
}
