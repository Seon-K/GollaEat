import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptChatResponse,
  adaptJudgement,
  adaptMenuDetail,
  adaptMenuListItem,
  adaptPagination,
  adaptRestaurant,
  mapServerStatus,
} from "@/lib/api/adapters";
import type {
  ApiChatResponse,
  ApiJudgement,
  ApiMenuDetail,
  ApiMenuListItem,
  ApiMenusResponse,
  ApiRestaurant,
} from "@/lib/api/types";

function loadSample<T>(name: string): T {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "docs/api-samples", name), "utf8"),
  ) as { body: T };
  return raw.body;
}

describe("mapServerStatus", () => {
  it("maps server → UI", () => {
    expect(mapServerStatus("match")).toBe("match");
    expect(mapServerStatus("needs_check")).toBe("check");
    expect(mapServerStatus("mismatch")).toBe("mismatch");
  });

  it("unknown → check", () => {
    expect(mapServerStatus("weird")).toBe("check");
    expect(mapServerStatus(undefined)).toBe("check");
  });
});

describe("adapters from api-samples", () => {
  it("adaptJudgement reasons → p12 rows", () => {
    const body = loadSample<ApiJudgement>("post_judgements.json");
    const ui = adaptJudgement(body);
    expect(ui.status).toBe("check");
    expect(ui.componentId).toBe("menus_008023");
    expect(ui.reasons.length).toBeGreaterThan(0);
    expect(ui.reasons[0]).toMatchObject({
      label: "우유",
      conditionCode: "allergen-milk",
      status: "check",
    });
    expect(ui.reasons[0].unknownItems).toEqual(["우유"]);
    expect(ui.unknownItems).toEqual(
      expect.arrayContaining(["우유", "돼지고기"]),
    );
    expect(ui.unknownItems).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/allergen-|:/)]),
    );
    expect(ui.unknownMessages.length).toBeGreaterThan(0);
  });

  it("adaptPagination uses real keys", () => {
    const body = loadSample<ApiMenusResponse>("get_menus.json");
    const p = adaptPagination(body.pagination);
    expect(p).toEqual({
      page: 1,
      limit: 5,
      count: 5,
      total: 8436,
      totalPages: 1688,
      nextPage: 2,
      previousPage: null,
    });
  });

  it("adaptMenuListItem distance_km null", () => {
    const body = loadSample<ApiMenusResponse>("get_menus.json");
    const item = adaptMenuListItem(body.results[0] as ApiMenuListItem);
    expect(item.id).toBe("menus_008023");
    expect(item.distanceKm).toBeNull();
    expect(item.judgement?.status).toBeDefined();
  });

  it("adaptMenuDetail does not expose analysis_reference", () => {
    const body = loadSample<ApiMenuDetail>("get_menu_detail.json");
    const ui = adaptMenuDetail(body);
    expect(ui).not.toHaveProperty("analysisReference");
    expect(ui.components).toEqual([]);
    expect(ui.optionGroups).toEqual([]);
  });

  it("adaptRestaurant map URLs", () => {
    const body = loadSample<{ results: ApiRestaurant[] }>(
      "get_restaurants.json",
    );
    const ui = adaptRestaurant(body.results[0]);
    expect(ui.map.kakaoMapUrl).toContain("map.kakao.com");
    expect(typeof ui.distanceKm).toBe("number");
  });

  it("adaptChatResponse empty matched/needs_check", () => {
    const body = loadSample<ApiChatResponse>("post_chat.json");
    const ui = adaptChatResponse(body);
    expect(ui.matched).toEqual([]);
    expect(ui.needsCheck).toEqual([]);
    expect(ui.placeCandidates).toEqual([]);
    expect(ui.message.length).toBeGreaterThan(0);
  });

  it("adaptChatResponse place_candidates + question", () => {
    const ui = adaptChatResponse({
      message: "검색 기준 장소를 선택해 주세요.",
      state: {
        radius_m: 1000,
        place: "순천향대",
        location: { lat: 36.77, lng: 126.93 },
      },
      result: {
        question: "검색 기준 장소를 선택해 주세요.",
        place_candidates: [
          {
            id: "10554058",
            name: "순천향대학교",
            address: "충남 아산시 신창면 순천향로 22",
            location: { lat: 36.7699, lng: 126.9315 },
          },
        ],
      },
    });
    expect(ui.question).toBe("검색 기준 장소를 선택해 주세요.");
    expect(ui.placeCandidates).toHaveLength(1);
    expect(ui.placeCandidates[0]?.name).toBe("순천향대학교");
    expect(ui.matched).toEqual([]);
  });

  it("adaptChatResponse flattens store menu groups", () => {
    const ui = adaptChatResponse({
      message: "식이 조건 일치",
      state: {},
      result: {
        matched: [
          {
            restaurant_id: "r1",
            restaurant: "예시분식",
            distance_m: 150,
            menus: [
              {
                menu_id: "menus_1",
                name: "김밥",
                reason: "확인된 정보상 식이 조건 일치",
              },
            ],
          },
        ],
        needs_check: [],
      },
    });
    expect(ui.matched).toEqual([
      {
        menuId: "menus_1",
        menuName: "김밥",
        restaurantId: "r1",
        restaurantName: "예시분식",
        distanceM: 150,
        reason: "확인된 정보상 식이 조건 일치",
      },
    ]);
  });

  it("snapshot: judgement / menus / menu detail / restaurant / chat", () => {
    const judgement = adaptJudgement(
      loadSample<ApiJudgement>("post_judgements.json"),
    );
    const menus = loadSample<ApiMenusResponse>("get_menus.json");
    const menuItems = menus.results
      .slice(0, 2)
      .map((m) => adaptMenuListItem(m as ApiMenuListItem));
    const detail = adaptMenuDetail(
      loadSample<ApiMenuDetail>("get_menu_detail.json"),
    );
    const restaurants = loadSample<{ results: ApiRestaurant[] }>(
      "get_restaurants.json",
    );
    const restaurant = adaptRestaurant(restaurants.results[0]);
    const chat = adaptChatResponse(
      loadSample<ApiChatResponse>("post_chat.json"),
    );

    expect({
      judgement,
      pagination: adaptPagination(menus.pagination),
      menuItems,
      detail,
      restaurant,
      chat,
    }).toMatchSnapshot();
  });
});
