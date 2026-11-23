import {
  adaptChatResponse,
  adaptJudgement,
  adaptMenuDetail,
  adaptMenuListItem,
  adaptPagination,
  adaptRestaurant,
  mapServerStatus,
} from "@/lib/api/adapters";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/client";
import type {
  ApiChatResponse,
  ApiCommunicationResponse,
  ApiDietaryCriteriaResponse,
  ApiFavoriteCreateResponse,
  ApiFavoritesResponse,
  ApiJudgement,
  ApiMenuDetail,
  ApiMenusResponse,
  ApiProfile,
  ApiRankResponse,
  ApiRestaurantsResponse,
  ApiReview,
  ApiReviewsResponse,
  ApiSession,
} from "@/lib/api/types";
import type { DataProvider } from "@/lib/api/providers/types";

export const apiProvider: DataProvider = {
  mode: "api",

  getSession: () => apiGet<ApiSession>("/api/session"),

  async getDietaryCriteria() {
    const res = await apiGet<ApiDietaryCriteriaResponse>(
      "/api/dietary-criteria",
    );
    return res.criteria ?? [];
  },

  getProfile: (options) => apiGet<ApiProfile>("/api/profile", undefined, options),

  putProfile: (criteria) =>
    apiPut<ApiProfile>("/api/profile", { criteria }),

  async getMenus(params = {}, options) {
    const res = await apiGet<ApiMenusResponse>("/api/menus", {
      q: params.q,
      page: params.page,
      limit: params.limit,
      category: params.category,
      lat: params.lat,
      lng: params.lng,
      radius_km: params.radius_km,
      sort: params.sort,
      min_price: params.min_price,
      max_price: params.max_price,
      personalize: params.personalize ?? true,
    }, options);
    return {
      items: (res.results ?? []).map(adaptMenuListItem),
      pagination: adaptPagination(res.pagination),
    };
  },

  async getMenu(menuId, options) {
    const res = await apiGet<ApiMenuDetail>(`/api/menus/${menuId}`, undefined, options);
    return adaptMenuDetail(res);
  },

  async getRestaurants(params = {}) {
    const res = await apiGet<ApiRestaurantsResponse>("/api/restaurants", {
      q: params.q,
      page: params.page,
      limit: params.limit,
      lat: params.lat,
      lng: params.lng,
      radius_km: params.radius_km,
      sort: params.sort,
    });
    return {
      items: (res.results ?? []).map(adaptRestaurant),
      pagination: adaptPagination(res.pagination),
    };
  },

  async postJudgement(menuId, options) {
    const res = await apiPost<ApiJudgement>("/api/judgements", {
      menu_id: menuId,
    }, options);
    return adaptJudgement(res);
  },

  async postRecommendationsRank(menuIds) {
    const res = await apiPost<ApiRankResponse>("/api/recommendations/rank", {
      menu_ids: menuIds,
    });
    return (res.results ?? []).map(adaptJudgement);
  },

  async postCommunication(components) {
    const res = await apiPost<ApiCommunicationResponse>("/api/communication", {
      components,
    });
    return {
      status: mapServerStatus(res.status),
      text: res.text,
      orderStatus: mapServerStatus(res.order?.status),
    };
  },

  async getFavorites() {
    const res = await apiGet<ApiFavoritesResponse>("/api/favorites");
    return res.favorites ?? [];
  },

  async addFavorite(menuId) {
    const res = await apiPost<ApiFavoriteCreateResponse>("/api/favorites", {
      menu_id: menuId,
    });
    return { id: res.id, menuId: res.menu_id };
  },

  async removeFavorite(id) {
    await apiDelete<{ deleted?: boolean }>(`/api/favorites/${id}`);
  },

  async getReviews(menuId) {
    const res = await apiGet<ApiReviewsResponse>("/api/reviews", {
      menu_id: menuId,
    });
    return res.reviews ?? [];
  },

  async createReview(input) {
    return apiPost<ApiReview>("/api/reviews", {
      menu_id: input.menuId,
      body: input.body,
      disclose_conditions: input.discloseConditions ?? [],
    });
  },

  async postChat(input) {
    const res = await apiPost<ApiChatResponse>("/api/chat", {
      message: input.message,
      location: input.location,
      radius_m: input.radius_m,
      new_conversation: input.new_conversation,
    }, { timeoutMs: 60_000 });
    return adaptChatResponse(res);
  },
};
