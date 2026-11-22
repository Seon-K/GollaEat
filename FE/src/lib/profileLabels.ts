import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import type { AllergenId, RestrictionId } from "@/types";

/** 알레르겐 + 제한을 표시용 라벨로 (중복 제거, 알레르겐 우선) */
export function uniqueAvoidLabels(
  allergens: AllergenId[],
  restrictions: RestrictionId[],
): string[] {
  const out: string[] = [];
  for (const id of allergens) {
    const label = allergenLabel(id);
    if (!out.includes(label)) out.push(label);
  }
  for (const id of restrictions) {
    const label = restrictionLabel(id);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * 직원 화면: 알레르겐 라벨 / 그 외 제한(알레르겐과 동일 라벨 제외)
 */
export function staffSectionLabels(
  allergens: AllergenId[],
  restrictions: RestrictionId[],
): { allergenLabels: string[]; restrictionLabels: string[] } {
  const allergenLabels: string[] = [];
  for (const id of allergens) {
    const label = allergenLabel(id);
    if (!allergenLabels.includes(label)) allergenLabels.push(label);
  }
  const restrictionLabels: string[] = [];
  for (const id of restrictions) {
    const label = restrictionLabel(id);
    if (allergenLabels.includes(label)) continue;
    if (!restrictionLabels.includes(label)) restrictionLabels.push(label);
  }
  return { allergenLabels, restrictionLabels };
}
