import type {
  ChatResultUi,
  JudgementUi,
  MenuDetailUi,
  MenuListItemUi,
  PaginationUi,
  RestaurantUi,
} from "@/lib/api/adapters";
import type {
  ApiDietaryCriterion,
  ApiFavorite,
  ApiReport,
  ReportInput,
  ApiProfile,
  ApiReview,
  ApiSession,
} from "@/lib/api/types";
import type { ApiRequestOptions } from "@/lib/api/client";

export type DataMode = "api" | "mock";

export interface MenuListParams {
  region?: string;
  judgement_status?: "match" | "needs_check" | "mismatch";
  restaurant_id?: string;
  q?: string;
  page?: number;
  limit?: number;
  category?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  sort?: string;
  personalize?: boolean;
  min_price?: number;
  max_price?: number;
}

export interface RestaurantListParams {
  view?: "card";
  region?: string;
  judgement_status?: "match" | "needs_check" | "mismatch";
  bounds?: string;
  personalize?: boolean;
  match_only?: boolean;
  category?: string;
  min_price?: number;
  max_price?: number;
  q?: string;
  page?: number;
  limit?: number;
  lat?: number;
  lng?: number;
  radius_km?: number;
  sort?: string;
}

export interface DataProvider {
  mode: DataMode;
  getSession(): Promise<ApiSession>;
  createReport(input: ReportInput): Promise<ApiReport>;
  getMyReports(page?: number, options?: ApiRequestOptions): Promise<{ items: ApiReport[]; pagination: PaginationUi }>;
  getDietaryCriteria(): Promise<ApiDietaryCriterion[]>;
  getProfile(options?: ApiRequestOptions): Promise<ApiProfile>;
  putProfile(criteria: string[]): Promise<ApiProfile>;
  getMenus(
    params?: MenuListParams,
    options?: ApiRequestOptions,
  ): Promise<{ items: MenuListItemUi[]; pagination: PaginationUi }>;
  getMenu(menuId: string, options?: ApiRequestOptions): Promise<MenuDetailUi>;
  getRestaurants(
    params?: RestaurantListParams,
    options?: ApiRequestOptions,
  ): Promise<{ items: RestaurantUi[]; pagination: PaginationUi }>;
  postJudgement(menuId: string, options?: ApiRequestOptions): Promise<JudgementUi>;
  postRecommendationsRank(menuIds: string[]): Promise<JudgementUi[]>;
  postCommunication(
    components: Array<{ id: string; role: string }>,
  ): Promise<{ status: JudgementUi["status"]; text: string; orderStatus: JudgementUi["status"] }>;
  getFavorites(): Promise<ApiFavorite[]>;
  addFavorite(menuId: string): Promise<{ id: number; menuId: string }>;
  removeFavorite(id: number): Promise<void>;
  getReviews(menuId: string): Promise<ApiReview[]>;
  updateReview(id: number, body: string): Promise<ApiReview>;
  deleteReview(id: number): Promise<void>;
  getMyReviews(page?: number): Promise<{ items: ApiReview[]; pagination: PaginationUi }>;
  createReview(input: {
    menuId: string;
    body: string;
    discloseConditions?: string[];
  }): Promise<ApiReview>;
  postChat(input: {
    message: string;
    location?: { lat: number; lng: number };
    radius_m?: number;
    new_conversation?: boolean;
  }): Promise<ChatResultUi>;
}
