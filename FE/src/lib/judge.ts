import { allergenLabel, allergenSearchLabels } from "@/data/allergens";
import {
  RESTRICTION_EXPANSION,
  restrictionLabel,
} from "@/data/restrictions";
import type {
  AllergenId,
  DietProfile,
  Judgement,
  JudgementReason,
  JudgementStatus,
  Menu,
  ReasonResult,
  RestrictionId,
} from "@/types";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s/g, "").replace(/·/g, "");
}

/** 프로필 제한 성분 → 매칭용 토큰(라벨·확장어) */
export function expandProfileTokens(profile: DietProfile): string[] {
  const tokens = new Set<string>();

  profile.allergens.forEach((id) => {
    allergenSearchLabels(id).forEach((label) => tokens.add(normalize(label)));
    tokens.add(normalize(id));
  });

  profile.restrictions.forEach((id) => {
    tokens.add(normalize(restrictionLabel(id)));
    (RESTRICTION_EXPANSION[id] ?? []).forEach((t) => tokens.add(normalize(t)));
  });

  return [...tokens].filter(Boolean);
}

function poolHits(pool: string[], tokens: string[]): string[] {
  const hits: string[] = [];
  for (const item of pool) {
    const n = normalize(item);
    if (tokens.some((t) => t && (n.includes(t) || t.includes(n)))) {
      hits.push(item);
    }
  }
  return hits;
}

function conditionTokens(conditionLabel: string, restrictionId?: RestrictionId): string[] {
  const tokens = new Set<string>([normalize(conditionLabel)]);
  if (restrictionId) {
    (RESTRICTION_EXPANSION[restrictionId] ?? []).forEach((t) =>
      tokens.add(normalize(t)),
    );
  }
  return [...tokens];
}

function reasonForCondition(
  condition: string,
  menu: Menu,
  tokens: string[],
): JudgementReason {
  if (!menu.hasIngredientInfo) {
    return { condition, result: "정보 없음" };
  }

  const pool = [...menu.confirmedIngredients, ...menu.confirmedAllergens];
  const hits = poolHits(pool, tokens);
  if (hits.length > 0) {
    return { condition, result: "포함 확인됨" };
  }

  return { condition, result: "포함 정보 없음 · 재료 정보 확인" };
}

/**
 * 메뉴 × 식이 프로필 판정
 * 우선순위: mismatch > check > match
 */
export function judgeMenu(menu: Menu, profile: DietProfile): Judgement {
  if (!profile.allergens.length && !profile.restrictions.length) return { status: "match", reasons: [] };
  const tokens = expandProfileTokens(profile);
  const pool = [...menu.confirmedIngredients, ...menu.confirmedAllergens];
  const restrictedHits = poolHits(pool, tokens);

  let status: JudgementStatus = "match";
  if (restrictedHits.length > 0) {
    status = "mismatch";
  } else if (!menu.hasIngredientInfo || menu.unconfirmed.length > 0) {
    status = "check";
  }

  const reasons: JudgementReason[] = [];

  profile.allergens.forEach((id: AllergenId) => {
    const label = allergenLabel(id);
    reasons.push(
      reasonForCondition(label, menu, allergenSearchLabels(id).map(normalize)),
    );
  });

  profile.restrictions.forEach((id: RestrictionId) => {
    const label = restrictionLabel(id);
    reasons.push(
      reasonForCondition(label, menu, conditionTokens(label, id)),
    );
  });

  // mismatch 시 해당 조건 결과는 반드시 "포함 확인됨"
  if (status === "mismatch") {
    for (const r of reasons) {
      const hits = poolHits(pool, conditionTokens(r.condition));
      if (hits.length > 0) {
        r.result = "포함 확인됨";
      }
    }
  }

  return { status, reasons };
}

export function reasonResultToTone(
  result: ReasonResult,
): JudgementStatus {
  switch (result) {
    case "포함 확인됨":
      return "mismatch";
    case "정보 없음":
      return "check";
    case "사용하지 않는 것으로 확인":
    case "포함 정보 없음 · 재료 정보 확인":
      return "match";
  }
}
