import { describe, expect, it, vi } from "vitest";
import { adaptRestaurant, adaptJudgement } from "./adapters";
import { filterParams } from "@/hooks/useDiscovery";
import { apiProvider } from "./providers/apiProvider";
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";
import type { ApiRestaurant } from "./types";

vi.mock("./client", () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() }));

describe("restaurant discovery API contract", () => {
  it("preserves the server official-list guidance and store confirmation notice", () => {
    const guidance = { label: "공식 알레르겐 표시 기준 일치", message: "공식 목록에 선택한 제한 성분이 기재되어 있지 않습니다.", notice: "주문 전 매장에 한 번 더 확인해 주세요.", basis: "official_allergen_list" };
    const result = adaptJudgement({ component_id: "menu", status: "match", reasons: [], problem_ingredients: [], unknown_items: [], sources: [], preference_score: 0, sort_key: [], guidance });
    expect(result.status).toBe("match");
    expect(result.guidance).toEqual(guidance);
  });
  it("updates and deletes reviews through the ownership-protected detail endpoint", async () => {
    vi.mocked(apiPatch).mockResolvedValue({ id: 7, body: "수정 내용", is_mine: true });
    await apiProvider.updateReview(7, "수정 내용");
    expect(apiPatch).toHaveBeenLastCalledWith("/api/reviews/7", { body: "수정 내용" });
    vi.mocked(apiDelete).mockResolvedValue({ deleted: true });
    await apiProvider.deleteReview(7);
    expect(apiDelete).toHaveBeenLastCalledWith("/api/reviews/7");
  });
  it("submits menu corrections and restaurant tips through the same report API", async () => {
    vi.mocked(apiPost).mockResolvedValue({ report_id: 12, status: "pending" });
    const correction = { menu_id: "selected-menu", category: "ingredients_allergens" as const, content: "직원에게 확인한 재료" };
    const receipt = await apiProvider.createReport(correction);
    expect(apiPost).toHaveBeenLastCalledWith("/api/reports", correction);
    expect(receipt.report_id).toBe(12);
    const business = { restaurant_id: "selected-store", category: "business" as const, content: "변경된 영업시간" };
    await apiProvider.createReport(business);
    expect(apiPost).toHaveBeenLastCalledWith("/api/reports", business);
  });
  it("requests only the session owner's paginated reviews", async () => {
    vi.mocked(apiGet).mockResolvedValue({ reviews: [{ id: 1, menu_id: "menu", body: "review", is_mine: true }],
      pagination: { page: 2, limit: 20, count: 1, total: 21, total_pages: 2, next_page: null, previous_page: 1 } });
    const result = await apiProvider.getMyReviews(2);
    expect(apiGet).toHaveBeenLastCalledWith("/api/reviews", { mine: true, page: 2, limit: 20 });
    expect(result.items[0].is_mine).toBe(true);
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.total).toBe(21);
  });
  it("requests the selected restaurant's menu page with server personalization", async () => {
    vi.mocked(apiGet).mockResolvedValue({ results: [], pagination: { page: 2, limit: 20, count: 0, total: 0, total_pages: 0, next_page: null, previous_page: null } });
    await apiProvider.getMenus({ restaurant_id: "selected-store", region: "아산시", personalize: true, sort: "dietary", page: 2, category: "한식" });
    expect(apiGet).toHaveBeenLastCalledWith("/api/menus", expect.objectContaining({
      restaurant_id: "selected-store", region: "아산시", personalize: true, sort: "dietary", page: 2, category: "한식",
    }));
  });
  it("passes map extent, user origin and server filters together", async () => {
    vi.mocked(apiGet).mockResolvedValue({ results: [], pagination: { page: 1, limit: 20, count: 0, total: 0, total_pages: 0, next_page: null, previous_page: null } });
    await apiProvider.getRestaurants({ bounds: "127,36,127.1,36.1", lat: 35, lng: 128,
      personalize: true, region: "아산시", match_only: true, category: "한식", max_price: 10000, sort: "dietary", page: 1 });
    expect(apiGet).toHaveBeenCalledWith("/api/restaurants", expect.objectContaining({
      bounds: "127,36,127.1,36.1", lat: 35, lng: 128, personalize: true, region: "아산시", match_only: true,
      category: "한식", max_price: 10000, sort: "dietary", radius_km: undefined,
    }));
  });
  it("maps server check status without inferring a restaurant verdict", () => {
    const raw = { restaurant_id: "r", restaurant_name: "가게", latitude: 36, longitude: 127,
      dietary_summary: { match_menu_count: 0, check_menu_count: 1, mismatch_menu_count: 0 },
      personalization: { applied: true, profile_configured: true },
      representative_menu: { menu_id: "m", menu_name: "메뉴", restaurant: { restaurant_id: "r", restaurant_name: "가게" },
        category: "한식", distance_km: null, price: { amount: 9000, currency: "KRW", raw: "9000", status: "fixed" },
        judgement: { component_id: "m", status: "needs_check", reasons: [], problem_ingredients: [], unknown_items: [], sources: [], preference_score: 0, sort_key: [1, 0, "m"] } },
    } as ApiRestaurant;
    const result = adaptRestaurant(raw);
    expect(result.representativeMenu?.judgement?.status).toBe("check");
    expect(result.dietarySummary?.match_menu_count).toBe(0);
    expect(result.personalization?.applied).toBe(true);
    expect(adaptRestaurant({ ...raw, representative_menu: null }).representativeMenu).toBeNull();
  });
  it("shares menu category and verdict filtering between home and map", () => {
    expect(filterParams({ query: " 김밥 ", category: "korean", status: "check", sort: "dietary" }, " 김밥 "))
      .toEqual({ q: "김밥", category: "한식", judgement_status: "needs_check", sort: "dietary" });
    expect(filterParams({ query: "", category: "all", status: "all", sort: "price_asc" }, ""))
      .toEqual({ q: undefined, category: undefined, judgement_status: undefined, sort: "price_asc" });
  });
});
