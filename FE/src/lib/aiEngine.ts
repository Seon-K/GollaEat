/**
 * 골라잇 AI 규칙 기반 mock 엔진
 * 파이프라인: parseIntent → search → buildResponse
 * 이후 LLM으로 교체 시 이 모듈의 구현만 바꾸면 됩니다.
 */
import { allergenByLabel, allergenLabel } from "@/data/allergens";
import {
  MENUS,
  ONYANG_ORIGIN,
  SCH_ORIGIN,
  STORES,
} from "@/data/mock";
import { restrictionLabel } from "@/data/restrictions";
import { distanceFrom, formatDistance } from "@/lib/geo";
import { buildAiStaffPhrase } from "@/lib/inquiry";
import { judgeMenu } from "@/lib/judge";
import { VERDICT_COPY } from "@/lib/verdictCopy";
import type {
  AllergenId,
  DietProfile,
  GeoPoint,
  JudgementStatus,
  Menu,
  RestrictionId,
  Store,
} from "@/types";

export type AiLocationKey = "sch" | "onyang";

export type AiIntentType =
  | "search"
  | "change_location"
  | "filter_menu"
  | "expand_radius"
  | "show_check"
  | "modify_profile";

export interface AiIntent {
  type: AiIntentType;
  rawText: string;
  locationKey?: AiLocationKey;
  menuKeyword?: string | null;
  radiusKm?: number;
  /** sessionProfile에서 제거할 알레르겐 */
  removeAllergens?: AllergenId[];
  /** sessionProfile에서 제거할 제한 재료 */
  removeRestrictions?: RestrictionId[];
}

export interface AiSessionContext {
  locationKey: AiLocationKey;
  radiusKm: number;
  menuKeyword: string | null;
  /** true면 check만 표시 */
  checkOnly: boolean;
  sessionProfile: DietProfile;
  profileModified: boolean;
}

export interface AiSearchHit {
  menu: Menu;
  store: Store;
  distanceKm: number;
  status: JudgementStatus;
  checkReason: string | null;
}

export interface AiContextChip {
  label: string;
}

export interface AiStaffPhraseBlock {
  menuId: string;
  menuName: string;
  text: string;
}

export interface AiBuiltResponse {
  text: string;
  contextChips: AiContextChip[];
  groups: Array<{ status: JudgementStatus; title: string; items: AiSearchHit[] }>;
  followUps: string[];
  showExpandRadius: boolean;
  expandLabel: string;
  staffPhrase: AiStaffPhraseBlock | null;
}

export const AI_LOCATIONS: Record<AiLocationKey, GeoPoint> = {
  sch: SCH_ORIGIN,
  onyang: ONYANG_ORIGIN,
};

export const SUGGESTED_QUESTIONS = [
  "순천향대 근처에서 먹을 수 있는 점심은?",
  "지금 내 조건에 맞는 메뉴 찾아줘",
  "김밥 메뉴만 보여줘",
  "추가 확인 필요한 메뉴도 보여줘",
] as const;

export function createInitialContext(profile: DietProfile): AiSessionContext {
  return {
    locationKey: "sch",
    radiusKm: 1,
    menuKeyword: null,
    checkOnly: false,
    sessionProfile: {
      allergens: [...profile.allergens],
      restrictions: [...profile.restrictions],
    },
    profileModified: false,
  };
}

/** 빈 상태용 프로필 칩 (디자인: 알레르겐 + 소고기 제외) */
export function profileConditionChips(profile: DietProfile): string[] {
  const chips = profile.allergens.map(allergenLabel);
  if (profile.restrictions.includes("beef")) {
    chips.push("소고기 제외");
  } else if (profile.restrictions[0]) {
    chips.push(`${restrictionLabel(profile.restrictions[0])} 제외`);
  }
  return chips;
}

export function checkReasonForMenu(menu: Menu): string {
  if (!menu.hasIngredientInfo) {
    return "재료 정보 없음 · 매장 확인 필요";
  }
  const hasBroth = menu.unconfirmed.some((u) => u.includes("육수"));
  if (hasBroth) return "육수 재료 확인 필요";
  if (menu.unconfirmed.length > 0) {
    return `${menu.unconfirmed.join(" · ")} 확인 필요`;
  }
  return "매장 확인 필요";
}

/** 김밥 필터 등 상세 카드용 */
export function checkReasonDetail(menu: Menu): string {
  if (!menu.hasIngredientInfo) {
    return "재료 정보 없음 · 매장에 직접 확인해 주세요.";
  }
  return checkReasonForMenu(menu);
}

function compact(text: string): string {
  return text.replace(/\s/g, "");
}

function detectLocation(text: string): AiLocationKey | undefined {
  const t = compact(text);
  if (t.includes("온양온천") || t.includes("온양역")) return "onyang";
  if (t.includes("순천향")) return "sch";
  return undefined;
}

function detectMenuKeyword(text: string): string | null | undefined {
  const t = compact(text);
  if (t.includes("김밥만") || t.includes("김밥메뉴") || t.includes("김밥")) {
    return "김밥";
  }
  if (t.includes("국수")) return "국수";
  if (t.includes("샐러드")) return "샐러드";
  if (t.includes("파스타")) return "파스타";
  // "메뉴만 보여줘" 류에서 키워드 해제 없음 — undefined면 유지
  return undefined;
}

function detectRemovedAllergens(text: string): AllergenId[] {
  const t = compact(text);
  const removed: AllergenId[] = [];
  // "새우는 빼줘", "새우 제외해줘"
  const removeCue =
    t.includes("빼") || t.includes("제외") || t.includes("빼고") || t.includes("없애");
  if (!removeCue) return removed;

  const candidates: Array<{ id: AllergenId; keys: string[] }> = [
    { id: "shrimp", keys: ["새우"] },
    { id: "peanut", keys: ["땅콩"] },
    { id: "milk", keys: ["우유"] },
    { id: "egg", keys: ["난류", "달걀", "계란"] },
    { id: "wheat", keys: ["밀"] },
    { id: "soy", keys: ["대두"] },
    { id: "crab", keys: ["게"] },
    { id: "pork", keys: ["돼지고기"] },
    { id: "beef", keys: ["쇠고기", "소고기"] },
    { id: "chicken", keys: ["닭고기"] },
  ];

  for (const c of candidates) {
    if (c.keys.some((k) => t.includes(k))) {
      removed.push(c.id);
    }
  }

  // 라벨 전체 스캔 (확장)
  if (removed.length === 0) {
    const byLabel = allergenByLabel(
      text.replace(/은|는|을|를|이|가|빼줘|빼|제외해줘|제외|해요|해줘/g, "").trim(),
    );
    if (byLabel) removed.push(byLabel.id);
  }

  return removed;
}

function detectRemovedRestrictions(text: string): RestrictionId[] {
  const t = compact(text);
  const removeCue =
    t.includes("빼") || t.includes("제외") || t.includes("빼고") || t.includes("없애");
  if (!removeCue) return [];

  const map: Array<{ id: RestrictionId; keys: string[] }> = [
    { id: "beef", keys: ["소고기", "쇠고기"] },
    { id: "pork", keys: ["돼지고기"] },
    { id: "chicken", keys: ["닭고기"] },
    { id: "animal_broth", keys: ["동물성육수", "육수"] },
  ];
  return map
    .filter((m) => m.keys.some((k) => t.includes(k)))
    .map((m) => m.id);
}

/**
 * 1) 사용자 발화 → 의도 + 세션 컨텍스트 갱신
 */
export function parseIntent(
  text: string,
  ctx: AiSessionContext,
): { intent: AiIntent; context: AiSessionContext } {
  const t = compact(text);
  const next: AiSessionContext = {
    ...ctx,
    sessionProfile: {
      allergens: [...ctx.sessionProfile.allergens],
      restrictions: [...ctx.sessionProfile.restrictions],
    },
  };

  const locationKey = detectLocation(text);
  const menuKeyword = detectMenuKeyword(text);
  const removeAllergens = detectRemovedAllergens(text);
  const removeRestrictions = detectRemovedRestrictions(text);

  let type: AiIntentType = "search";

  if (
    t.includes("범위넓") ||
    t.includes("넓게탐색") ||
    t.includes("1km보다") ||
    t.includes("반경넓") ||
    t.includes("더넓")
  ) {
    type = "expand_radius";
    next.radiusKm = Math.max(next.radiusKm, 2);
  } else if (
    t.includes("추가확인") ||
    t.includes("확인필요") ||
    (t.includes("확인") && t.includes("보여"))
  ) {
    type = "show_check";
    next.checkOnly = true;
  } else if (menuKeyword) {
    // 메뉴 키워드가 있으면 필터 우선 (「보여줘」의 「로」와 장소 변경 혼동 방지)
    type = "filter_menu";
    next.menuKeyword = menuKeyword;
    next.checkOnly = false;
  } else if (removeAllergens.length || removeRestrictions.length) {
    type = "modify_profile";
    if (removeAllergens.length) {
      next.sessionProfile.allergens = next.sessionProfile.allergens.filter(
        (a) => !removeAllergens.includes(a),
      );
      next.profileModified = true;
    }
    if (removeRestrictions.length) {
      next.sessionProfile.restrictions =
        next.sessionProfile.restrictions.filter(
          (r) => !removeRestrictions.includes(r),
        );
      next.profileModified = true;
    }
  } else if (
    locationKey &&
    (t.includes("변경") || t.includes("근처로") || t.includes("근처"))
  ) {
    type = t.includes("변경") ? "change_location" : "search";
    next.locationKey = locationKey;
    if (t.includes("변경")) next.radiusKm = 1;
  }

  if (locationKey) next.locationKey = locationKey;
  if (menuKeyword !== undefined) next.menuKeyword = menuKeyword;

  if (
    type === "search" &&
    (t.includes("순천향") || t.includes("내조건") || t.includes("점심"))
  ) {
    next.checkOnly = false;
  }

  const intent: AiIntent = {
    type,
    rawText: text,
    locationKey: next.locationKey,
    menuKeyword: next.menuKeyword,
    radiusKm: next.radiusKm,
    removeAllergens,
    removeRestrictions,
  };

  return { intent, context: next };
}

/**
 * 2) 컨텍스트 기준 메뉴 검색 (가까운 순, 상태 필터)
 */
export function search(
  ctx: AiSessionContext,
  menus: Menu[] = MENUS,
  stores: Store[] = STORES,
): AiSearchHit[] {
  const origin = AI_LOCATIONS[ctx.locationKey];
  const hits: AiSearchHit[] = [];

  for (const menu of menus) {
    if (ctx.menuKeyword && !menu.name.includes(ctx.menuKeyword)) continue;

    const store = stores.find((s) => s.id === menu.storeId);
    if (!store) continue;

    const distanceKm = distanceFrom(store, origin);
    if (distanceKm > ctx.radiusKm + 1e-9) continue;

    const judgement = judgeMenu(menu, ctx.sessionProfile);
    if (judgement.status === "mismatch") continue; // 기본 숨김
    if (ctx.checkOnly && judgement.status !== "check") continue;

    hits.push({
      menu,
      store,
      distanceKm,
      status: judgement.status,
      checkReason:
        judgement.status === "check" ? checkReasonForMenu(menu) : null,
    });
  }

  hits.sort((a, b) => {
    const order: Record<JudgementStatus, number> = {
      match: 0,
      check: 1,
      mismatch: 2,
    };
    const byStatus = order[a.status] - order[b.status];
    if (byStatus !== 0) return byStatus;
    return a.distanceKm - b.distanceKm;
  });

  // 섹션 내부 가까운 순을 위해 그룹핑 전 거리 정렬 유지
  // (상태 우선 후 거리 — 그룹 렌더 시 재정렬)
  return hits;
}

function groupHits(
  hits: AiSearchHit[],
): AiBuiltResponse["groups"] {
  const statuses: JudgementStatus[] = ["match", "check"];
  return statuses
    .map((status) => {
      const items = hits
        .filter((h) => h.status === status)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      return {
        status,
        title: VERDICT_COPY[status].title,
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}

function locationLabel(key: AiLocationKey): string {
  return AI_LOCATIONS[key].label;
}

function buildContextChips(
  ctx: AiSessionContext,
  intent: AiIntent,
): AiContextChip[] {
  // p22 김밥 필터: "순천향대" / "기존 프로필 적용"
  if (intent.type === "filter_menu" && ctx.menuKeyword) {
    return [
      { label: locationLabel(ctx.locationKey) },
      {
        label: ctx.profileModified
          ? "대화 조건 적용"
          : "기존 프로필 적용",
      },
    ];
  }

  const chips: AiContextChip[] = [
    { label: `위치: ${locationLabel(ctx.locationKey)}` },
    { label: `반경 ${ctx.radiusKm}km` },
  ];
  chips.push({
    label: ctx.profileModified ? "대화 식이조건 적용" : "내 식이조건 적용",
  });
  return chips;
}

function buildFollowUps(ctx: AiSessionContext): string[] {
  const ups: string[] = [];
  if (ctx.menuKeyword !== "김밥") ups.push("김밥만 보여줘");
  if (ctx.locationKey !== "onyang") ups.push("온양온천역 근처로 변경");
  else ups.push("순천향대 근처로 변경");
  if (!ctx.checkOnly) ups.push("추가 확인 필요한 메뉴도 보여줘");
  if (
    ctx.sessionProfile.allergens.includes("shrimp") &&
    ctx.profileModified === false
  ) {
    // 후속 예시로 노출하진 않고, 파싱만 지원 — 디자인 칩은 2개
  }
  return ups.slice(0, 2);
}

function buildReplyText(
  intent: AiIntent,
  ctx: AiSessionContext,
  hits: AiSearchHit[],
): string {
  const loc = locationLabel(ctx.locationKey);
  const radius = `${ctx.radiusKm}km`;

  if (hits.length === 0) {
    return `${loc} 기준 ${radius} 안에서 조건에 맞는 메뉴를 찾지 못했어요. 범위를 넓히거나 조건을 바꿔 다시 물어봐 주세요.`;
  }

  switch (intent.type) {
    case "filter_menu":
      return `${loc}와 식이 조건은 유지하고 ${ctx.menuKeyword} 메뉴만 찾아봤어요. 확인되지 않은 정보는 따로 표시해요.`;
    case "change_location":
      return `${loc} 기준 ${radius} 안에서 찾아봤어요. 상태별로 나눈 뒤 각 목록에서 가까운 매장부터 안내할게요.`;
    case "expand_radius":
      return `반경을 ${radius}로 넓혀 다시 찾아봤어요. 상태별로 가까운 매장부터 안내할게요.`;
    case "show_check":
      return `추가 확인이 필요한 메뉴를 모아봤어요. 확인되지 않은 정보는 매장에서 한 번 더 확인해 주세요.`;
    case "modify_profile":
      return `이번 대화에만 조건을 반영해 다시 찾아봤어요. 프로필 저장 값은 그대로 유지됩니다.`;
    default:
      return `${loc} 기준 ${radius} 안에서 찾아봤어요. 상태별로 나눈 뒤 각 목록에서 가까운 매장부터 안내할게요.`;
  }
}

/**
 * 3) 검색 결과 → UI용 응답 모델
 */
export function buildResponse(
  intent: AiIntent,
  hits: AiSearchHit[],
  ctx: AiSessionContext,
): AiBuiltResponse {
  const groups = groupHits(hits);
  const firstCheck = hits.find((h) => h.status === "check");

  // p22: 김밥 필터 등에서 확인 문구 카드 노출 / p21 기본 검색은 카드 버튼만
  const staffPhrase: AiStaffPhraseBlock | null =
    firstCheck &&
    (intent.type === "filter_menu" || intent.type === "show_check")
      ? {
          menuId: firstCheck.menu.id,
          menuName: firstCheck.menu.name,
          text: buildAiStaffPhrase(
            firstCheck.menu.name,
            ctx.sessionProfile.allergens,
            ctx.sessionProfile.restrictions,
          ),
        }
      : null;

  return {
    text: buildReplyText(intent, ctx, hits),
    contextChips: buildContextChips(ctx, intent),
    groups,
    followUps: buildFollowUps(ctx),
    showExpandRadius: ctx.radiusKm < 2,
    expandLabel:
      ctx.radiusKm < 2
        ? `범위 넓히기 · ${ctx.radiusKm}km보다 넓게 탐색`
        : "범위 넓히기",
    staffPhrase,
  };
}

/** 편의: parse → search → build 한 번에 */
export function runAiQuery(
  text: string,
  ctx: AiSessionContext,
): { context: AiSessionContext; intent: AiIntent; response: AiBuiltResponse } {
  const { intent, context } = parseIntent(text, ctx);
  const hits = search(context);
  const response = buildResponse(intent, hits, context);
  return { context, intent, response };
}

export function formatHitDistance(hit: AiSearchHit): string {
  return `${formatDistance(hit.distanceKm, "m")} · 직선거리`;
}
