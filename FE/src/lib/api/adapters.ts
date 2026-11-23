/**
 * 서버 JSON → UI 모델. analysis_reference 는 어떤 UI 모델에도 넣지 않는다.
 */
import type { JudgementStatus } from "@/types";
import type {
  ApiChatResponse,
  ApiJudgement,
  ApiJudgementReason,
  ApiMenuDetail,
  ApiMenuListItem,
  ApiPagination,
  ApiRestaurant,
  ServerJudgementStatus,
  UiJudgementStatus,
} from "@/lib/api/types";
import { humanizeUnknownItems } from "@/lib/unknownItems";

export function mapServerStatus(
  status: ServerJudgementStatus | null | undefined,
): UiJudgementStatus {
  if (status === "match") return "match";
  if (status === "mismatch") return "mismatch";
  if (status === "needs_check") return "check";
  // 알 수 없는 값 → 안전 쪽 보수적
  if (status != null && status !== "") {
    console.warn("[api/adapters] unknown judgement status → check:", status);
  }
  return "check";
}

/** @deprecated alias — JudgementStatus 와 동일 */
export function toDomainStatus(status: ServerJudgementStatus): JudgementStatus {
  return mapServerStatus(status);
}

export interface PaginationUi {
  page: number;
  limit: number;
  count: number;
  total: number;
  totalPages: number;
  nextPage: number | null;
  previousPage: number | null;
}

export function adaptPagination(p: ApiPagination | undefined | null): PaginationUi {
  if (!p || typeof p !== "object") {
    return {
      page: 1,
      limit: 20,
      count: 0,
      total: 0,
      totalPages: 0,
      nextPage: null,
      previousPage: null,
    };
  }
  return {
    page: p.page,
    limit: p.limit,
    count: p.count,
    total: p.total,
    totalPages: p.total_pages,
    nextPage: p.next_page,
    previousPage: p.previous_page,
  };
}

/** p12 「내 식이 조건별 비교」 행 */
export interface ReasoningRowUi {
  /** 조건 표시명 (reason.name) */
  label: string;
  /** 조건 코드 (reason.condition) */
  conditionCode: string;
  status: UiJudgementStatus;
  /** 근거 요약 */
  detail: string;
  unknownItems: string[];
  ruleSource: string;
}

function detailFromReason(reason: ApiJudgementReason): string {
  const status = mapServerStatus(reason.status);
  // p12 디자인 카피 — 원문 태그(milk·source)는 노출하지 않음
  if (status === "check") return "포함 정보 없음 · 재료 정보 확인";
  if (status === "match") return "사용하지 않는 것으로 확인";
  if (status === "mismatch") return "포함 확인됨";
  if (reason.rule_source) return reason.rule_source;
  return "";
}

export function adaptReasoningRows(judgement: ApiJudgement): ReasoningRowUi[] {
  const reasons = Array.isArray(judgement.reasons) ? judgement.reasons : [];
  return reasons.map((r) => ({
    label: r.name || r.condition,
    conditionCode: r.condition,
    status: mapServerStatus(r.status),
    detail: detailFromReason(r),
    unknownItems: humanizeUnknownItems(
      Array.isArray(r.unknown_items) ? r.unknown_items : [],
    ),
    ruleSource: r.rule_source ?? "",
  }));
}

export interface JudgementUi {
  componentId: string;
  status: UiJudgementStatus;
  reasons: ReasoningRowUi[];
  problemIngredients: unknown[];
  unknownItems: string[];
  unknownMessages: string[];
  sources: unknown[];
  preferenceScore: number;
  sortKey: unknown[];
  name?: string;
  role?: string;
}

export function adaptJudgement(raw: ApiJudgement): JudgementUi {
  return {
    componentId: raw.component_id,
    status: mapServerStatus(raw.status),
    reasons: adaptReasoningRows(raw),
    problemIngredients: Array.isArray(raw.problem_ingredients)
      ? raw.problem_ingredients
      : [],
    unknownItems: humanizeUnknownItems(
      Array.isArray(raw.unknown_items) ? raw.unknown_items : [],
    ),
    unknownMessages: Array.isArray(raw.unknown_messages)
      ? raw.unknown_messages
      : [],
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    preferenceScore: raw.preference_score ?? 0,
    sortKey: Array.isArray(raw.sort_key) ? raw.sort_key : [],
    name: raw.name,
    role: raw.role,
  };
}

export interface MapLinksUi {
  kakaoMapUrl: string | null;
  kakaoDirectionsUrl: string | null;
  walkingDirectionsUrl: string | null;
  mapUrl: string | null;
}

export function adaptMapLinks(r: {
  kakao_map_url?: string | null;
  kakao_directions_url?: string | null;
  walking_directions_url?: string | null;
  map_url?: string | null;
}): MapLinksUi {
  return {
    kakaoMapUrl: r.kakao_map_url ?? null,
    kakaoDirectionsUrl: r.kakao_directions_url ?? null,
    walkingDirectionsUrl: r.walking_directions_url ?? null,
    mapUrl: r.map_url ?? null,
  };
}

export interface RestaurantUi {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 직선거리 km — null 이면 UI에서 숨김 */
  distanceKm: number | null;
  address: string | null;
  phone: string | null;
  map: MapLinksUi;
}

export function adaptRestaurant(r: ApiRestaurant): RestaurantUi {
  return {
    id: r.restaurant_id,
    name: r.restaurant_name,
    lat: r.latitude,
    lng: r.longitude,
    distanceKm: r.distance_km ?? null,
    address: typeof r.address === "string" ? r.address : null,
    phone: typeof r.phone === "string" ? r.phone : null,
    map: adaptMapLinks(r),
  };
}

export interface MenuListItemUi {
  id: string;
  name: string;
  restaurantId: string;
  restaurantName: string;
  priceAmount: number;
  currency: string;
  category: string;
  distanceKm: number | null;
  /** 매장 좌표 — 지도 마커용 (없으면 null) */
  lat: number | null;
  lng: number | null;
  saved: boolean;
  judgement: JudgementUi | null;
}

export function adaptMenuListItem(m: ApiMenuListItem): MenuListItemUi {
  const lat =
    typeof m.restaurant?.latitude === "number" ? m.restaurant.latitude : null;
  const lng =
    typeof m.restaurant?.longitude === "number" ? m.restaurant.longitude : null;
  return {
    id: m.menu_id,
    name: m.menu_name,
    restaurantId: m.restaurant?.restaurant_id ?? "",
    restaurantName: m.restaurant?.restaurant_name ?? "",
    priceAmount: m.price?.amount ?? 0,
    currency: m.price?.currency ?? "KRW",
    category: m.category ?? "",
    distanceKm: m.distance_km ?? null,
    lat,
    lng,
    saved: Boolean(m.saved),
    judgement: m.judgement ? adaptJudgement(m.judgement) : null,
  };
}

export interface MenuDetailUi {
  id: string;
  name: string;
  restaurantId: string;
  restaurantName: string;
  priceAmount: number;
  category: string;
  distanceKm: number | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  allergenInformation: unknown;
  /**
   * analysis_reference 는 의도적으로 제외 (미검증, 판정 사용 금지)
   */
  /** TODO(sample): 원소 스키마 미확보 — unknown 방어 */
  components: unknown[];
  optionGroups: unknown[];
}

function asUnknownArray(value: unknown, field: string): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  console.warn(`[api/adapters] expected array for ${field}, got`, typeof value);
  return [];
}

export function adaptMenuDetail(m: ApiMenuDetail): MenuDetailUi {
  // analysis_reference 는 읽기만 하고 UI 모델에 넣지 않음
  if (m.analysis_reference != null) {
    // 존재 여부만 로그 가능 — 매핑 금지
  }

  const components = asUnknownArray(m.components, "components");
  const optionGroups = asUnknownArray(m.option_groups, "option_groups");
  // TODO(sample): non-empty components/option_groups 정규화

  return {
    id: m.menu_id,
    name: m.menu_name,
    restaurantId:
      m.restaurant?.restaurant_id ??
      (typeof m.restaurant_id === "string" ? m.restaurant_id : ""),
    restaurantName:
      m.restaurant?.restaurant_name ??
      (typeof m.restaurant_name === "string" ? m.restaurant_name : ""),
    priceAmount: m.price?.amount ?? m.price_amount ?? 0,
    category: typeof m.category === "string" ? m.category : "",
    distanceKm: m.distance_km ?? null,
    lat:
      typeof m.latitude === "number"
        ? m.latitude
        : typeof m.restaurant?.latitude === "number"
          ? m.restaurant.latitude
          : null,
    lng:
      typeof m.longitude === "number"
        ? m.longitude
        : typeof m.restaurant?.longitude === "number"
          ? m.restaurant.longitude
          : null,
    phone:
      typeof m.phone === "string"
        ? m.phone
        : typeof m.restaurant?.phone === "string"
          ? m.restaurant.phone
          : null,
    allergenInformation: m.allergen_information ?? null,
    components,
    optionGroups,
  };
}

export interface ChatPlaceCandidateUi {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
}

/** 채팅 추천 카드 1행 (매장·메뉴 펼친 형태) */
export interface ChatMenuHitUi {
  menuId: string;
  menuName: string;
  restaurantId: string;
  restaurantName: string;
  distanceM: number | null;
  reason: string;
}

export interface ChatResultUi {
  message: string;
  /** 후속 확인 질문 (message 와 동일할 수 있음) */
  question: string | null;
  placeCandidates: ChatPlaceCandidateUi[];
  matched: ChatMenuHitUi[];
  needsCheck: ChatMenuHitUi[];
  criteria: string[];
  radiusM: number | null;
  nextRadiusM?: number;
  state: ApiChatResponse["state"];
}

function adaptPlaceCandidates(raw: unknown): ChatPlaceCandidateUi[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatPlaceCandidateUi[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      console.warn("[api/adapters] place_candidate shape unexpected:", item);
      continue;
    }
    const o = item as Record<string, unknown>;
    const loc = o.location;
    if (
      typeof o.id !== "string" ||
      typeof o.name !== "string" ||
      !loc ||
      typeof loc !== "object"
    ) {
      console.warn("[api/adapters] place_candidate missing fields:", item);
      continue;
    }
    const { lat, lng } = loc as { lat?: unknown; lng?: unknown };
    if (typeof lat !== "number" || typeof lng !== "number") {
      console.warn("[api/adapters] place_candidate location invalid:", item);
      continue;
    }
    out.push({
      id: o.id,
      name: o.name,
      address: typeof o.address === "string" ? o.address : "",
      location: { lat, lng },
    });
  }
  return out;
}

/**
 * BE chatbot.backend 그룹 형태:
 * { restaurant_id, restaurant, distance_m, menus: [{ menu_id, name, reason }] }
 */
function flattenChatStoreGroups(raw: unknown, field: string): ChatMenuHitUi[] {
  const groups = asUnknownArray(raw, field);
  const hits: ChatMenuHitUi[] = [];
  for (const group of groups) {
    if (!group || typeof group !== "object") {
      console.warn(`[api/adapters] ${field} item unexpected:`, group);
      continue;
    }
    const g = group as Record<string, unknown>;
    const restaurantName =
      (typeof g.restaurant === "string" && g.restaurant) ||
      (typeof g.restaurant_name === "string" && g.restaurant_name) ||
      "";
    const restaurantId =
      typeof g.restaurant_id === "string" ? g.restaurant_id : "";
    const distanceM =
      typeof g.distance_m === "number" && Number.isFinite(g.distance_m)
        ? g.distance_m
        : null;
    const menus = Array.isArray(g.menus) ? g.menus : null;
    if (menus) {
      for (const menu of menus) {
        if (!menu || typeof menu !== "object") continue;
        const m = menu as Record<string, unknown>;
        const menuId =
          typeof m.menu_id === "string"
            ? m.menu_id
            : typeof m.id === "string"
              ? m.id
              : "";
        const menuName =
          (typeof m.name === "string" && m.name) ||
          (typeof m.menu_name === "string" && m.menu_name) ||
          menuId;
        if (!menuId && !menuName) continue;
        hits.push({
          menuId,
          menuName,
          restaurantId,
          restaurantName,
          distanceM,
          reason: typeof m.reason === "string" ? m.reason : "",
        });
      }
      continue;
    }
    // 평면 원소 폴백 (구 샘플/미확정 스키마)
    const menuId =
      typeof g.menu_id === "string"
        ? g.menu_id
        : typeof g.id === "string"
          ? g.id
          : "";
    if (!menuId) {
      console.warn(`[api/adapters] ${field} could not normalize:`, group);
      continue;
    }
    hits.push({
      menuId,
      menuName:
        (typeof g.menu_name === "string" && g.menu_name) ||
        (typeof g.name === "string" && g.name) ||
        menuId,
      restaurantId,
      restaurantName,
      distanceM,
      reason: typeof g.reason === "string" ? g.reason : "",
    });
  }
  return hits;
}

export function adaptChatResponse(raw: ApiChatResponse): ChatResultUi {
  const result = raw.result ?? {};
  const question =
    typeof result.question === "string" && result.question.trim()
      ? result.question
      : null;
  const placeCandidates = adaptPlaceCandidates(result.place_candidates);
  const matched = flattenChatStoreGroups(result.matched, "result.matched");
  const needsCheck = flattenChatStoreGroups(
    result.needs_check,
    "result.needs_check",
  );

  return {
    message: raw.message || question || "",
    question,
    placeCandidates,
    matched,
    needsCheck,
    criteria: Array.isArray(result.criteria) ? result.criteria : [],
    radiusM: typeof result.radius_m === "number" ? result.radius_m : null,
    ...(typeof result.next_radius_m === "number" ? { nextRadiusM: result.next_radius_m } : {}),
    state: raw.state ?? {},
  };
}
