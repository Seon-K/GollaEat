/**
 * 서버 응답 타입 — docs/api-samples 실측 키 기준
 * 샘플에 없는 필드는 optional + 주석(TODO sample)
 */

/** 서버 판정 상태 */
export type ServerJudgementStatus = "match" | "needs_check" | "mismatch" | string;

/** UI 판정 상태 */
export type UiJudgementStatus = "match" | "check" | "mismatch";

export interface ApiSession {
  csrf_token: string;
  identity: string;
}

export interface ApiDietaryCriterion {
  code: string;
  name: string;
  kind: string;
  category: string;
}

export interface ApiDietaryCriteriaResponse {
  criteria: ApiDietaryCriterion[];
}

/** GET /api/allergens — 한글 라벨 문자열 배열 */
export interface ApiAllergensResponse {
  allergens: string[];
}

export interface ApiRestrictedCategory {
  name: string;
  items: string[];
}

export interface ApiRestrictedIngredientsResponse {
  categories: ApiRestrictedCategory[];
}

export interface ApiProfile {
  criteria: string[];
  setup_completed: boolean;
}

export interface ApiPagination {
  page: number;
  limit: number;
  count: number;
  total: number;
  total_pages: number;
  next_page: number | null;
  previous_page: number | null;
}

export interface ApiPrice {
  raw?: string;
  amount: number;
  currency: string;
  status?: string;
}

export interface ApiRestaurantRef {
  restaurant_id: string;
  restaurant_name: string;
  latitude?: number;
  longitude?: number;
}

/**
 * judgement.reasons[] — post_judgements.json 실측
 */
export interface ApiJudgementReason {
  condition: string;
  name: string;
  status: ServerJudgementStatus;
  problem_ingredients: unknown[]; // TODO(sample): non-empty 형태 미확보
  unknown_items: string[];
  verified_problem_ingredients: unknown[];
  ai_problem_ingredients: unknown[];
  ai_evidence: unknown[];
  rule_source: string;
  sources: unknown[]; // TODO(sample): non-empty 형태 미확보
}

export interface ApiJudgement {
  component_id: string;
  status: ServerJudgementStatus;
  reasons: ApiJudgementReason[];
  problem_ingredients: unknown[];
  unknown_items: string[];
  unknown_messages?: string[];
  ai_evidence?: unknown[];
  sources: unknown[];
  preference_score: number;
  sort_key: unknown[];
  /** orders/check · communication 중첩 시 */
  role?: string;
  name?: string;
}

export interface ApiMenuListItem {
  menu_id: string;
  menu_name: string;
  description?: string;
  restaurant: ApiRestaurantRef;
  price: ApiPrice;
  category: string;
  distance_km: number | null;
  brand?: string;
  saved?: boolean;
  judgement?: ApiJudgement;
  /** 기타 원본 키 — 목록 샘플에 다수 */
  [key: string]: unknown;
}

export interface ApiMenusResponse {
  results: ApiMenuListItem[];
  pagination: ApiPagination;
}

/**
 * analysis_reference — 미검증. UI 모델에 매핑하지 말 것.
 * 샘플 menus_008023 은 null. 채워진 형태 TODO(sample)
 */
export type ApiAnalysisReference = unknown | null;

export interface ApiMenuDetail {
  menu_id: string;
  menu_name: string;
  restaurant_id?: string;
  restaurant_name?: string;
  restaurant?: ApiRestaurantRef;
  price?: ApiPrice;
  price_amount?: number;
  category?: string;
  distance_km?: number | null;
  latitude?: number;
  longitude?: number;
  allergen_information?: unknown;
  /** 판정·배지·확인 재료에 사용 금지 */
  analysis_reference?: ApiAnalysisReference;
  /** TODO(sample): non-empty 원소 스키마 미확보 */
  components?: unknown[];
  /** TODO(sample): non-empty 원소 스키마 미확보 */
  option_groups?: unknown[];
  ingredients?: unknown[];
  [key: string]: unknown;
}

export interface ApiRestaurant {
  restaurant_id: string;
  restaurant_name: string;
  latitude: number;
  longitude: number;
  distance_km?: number | null;
  address?: string;
  phone?: string;
  map_url?: string | null;
  kakao_map_url?: string | null;
  kakao_directions_url?: string | null;
  walking_directions_url?: string | null;
  [key: string]: unknown;
}

export interface ApiRestaurantsResponse {
  results: ApiRestaurant[];
  pagination?: ApiPagination;
}

export interface ApiRankResponse {
  results: ApiJudgement[];
}

export interface ApiOrderCheckRequest {
  components: Array<{ id: string; role: string }>;
}

export interface ApiOrderCheckResponse {
  status: ServerJudgementStatus;
  components: ApiJudgement[];
  selection_validation?: unknown;
}

export interface ApiCommunicationResponse {
  status: ServerJudgementStatus;
  text: string;
  order: ApiOrderCheckResponse;
}

export interface ApiFavoriteMenu {
  component_id?: string;
  name?: string;
  role?: string;
  menu_id: string;
  menu_name?: string;
  restaurant?: ApiRestaurantRef;
  price?: ApiPrice;
  sale_status?: string;
}

export interface ApiFavorite {
  id: number;
  menu_id: string;
  menu?: ApiFavoriteMenu;
  catalog_status?: string;
  judgement?: ApiJudgement;
}

export interface ApiFavoritesResponse {
  favorites: ApiFavorite[];
  pagination?: ApiPagination;
}

export interface ApiFavoriteCreateResponse {
  id: number;
  menu_id: string;
}

export interface ApiReview {
  id: number;
  menu_id: string;
  body: string;
  /** 샘플 get_reviews.json 실측 */
  is_mine?: boolean;
  disclosed_conditions?: Array<{
    code: string;
    name: string;
    kind: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface ApiReviewsResponse {
  reviews: ApiReview[];
  pagination?: ApiPagination;
}

/** POST /api/chat — place_candidates 원소 (실측) */
export interface ApiChatPlaceCandidate {
  id: string;
  name: string;
  address?: string;
  location: { lat: number; lng: number };
}

/**
 * chat result
 * - question + place_candidates: 장소 선택 턴
 * - matched / needs_check: 매장 그룹(restaurant + menus[]) 또는 빈 배열
 * TODO(sample): 채워진 matched 스키마는 BE 테스트·실응답 기준 정규화
 */
export interface ApiChatResponse {
  message: string;
  state: {
    radius_m?: number;
    criteria?: string[];
    location?: { lat: number; lng: number };
    menu?: string;
    place?: string;
    allergens?: string[];
    [key: string]: unknown;
  };
  result: {
    matched?: unknown[];
    needs_check?: unknown[];
    criteria?: string[];
    radius_m?: number;
    question?: string;
    place_candidates?: ApiChatPlaceCandidate[];
    [key: string]: unknown;
  };
}

export interface ApiMenuCategoriesResponse {
  categories?: string[];
  [key: string]: unknown;
}
