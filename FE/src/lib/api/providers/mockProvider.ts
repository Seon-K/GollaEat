/**
 * mock 모드 — 기존 /src/data + lib/judge.ts 만 사용 (서버 판정 없음)
 */
import {
  adaptChatResponse,
  type ChatResultUi,
  type JudgementUi,
  type MenuDetailUi,
  type MenuListItemUi,
  type PaginationUi,
  type ReasoningRowUi,
  type RestaurantUi,
} from "@/lib/api/adapters";
import { MENUS, SCH_ORIGIN, STORES } from "@/data/mock";
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { distanceFrom } from "@/lib/geo";
import { judgeMenu, reasonResultToTone } from "@/lib/judge";
import type { DataProvider } from "@/lib/api/providers/types";
import type {
  ApiDietaryCriterion,
  ApiFavorite,
  ApiProfile,
  ApiReview,
  ApiSession,
} from "@/lib/api/types";
import type { DietProfile, JudgementStatus } from "@/types";

let mockCriteria: string[] = ["allergen-milk", "exclude-pork"];
let mockSetupCompleted = false;
const mockFavorites = new Map<number, string>();
let favSeq = 1;
const mockReviews: ApiReview[] = [];
let reviewSeq = 1;

function profileFromCriteria(codes: string[]): DietProfile {
  const allergens: DietProfile["allergens"] = [];
  const restrictions: DietProfile["restrictions"] = [];
  for (const code of codes) {
    if (code.startsWith("allergen-")) {
      const id = code.replace("allergen-", "") as DietProfile["allergens"][number];
      // mock: peanut/milk/shrimp 등 로컬 id 와 다를 수 있음 — 알려진 것만
      if (
        [
          "egg",
          "milk",
          "buckwheat",
          "peanut",
          "soy",
          "wheat",
          "mackerel",
          "crab",
          "shrimp",
          "pork",
          "peach",
          "tomato",
          "sulfite",
          "walnut",
          "chicken",
          "beef",
          "squid",
          "shellfish",
          "pinenut",
        ].includes(id)
      ) {
        allergens.push(id);
      }
    } else if (code.startsWith("exclude-")) {
      const id = code.replace("exclude-", "") as DietProfile["restrictions"][number];
      if (
        [
          "beef",
          "pork",
          "chicken",
          "other_meat",
          "fish",
          "crustacean",
          "shellfish",
          "egg",
          "milk",
          "cheese_butter",
          "honey",
          "gelatin",
          "animal_broth",
        ].includes(id)
      ) {
        restrictions.push(id);
      }
    }
  }
  return { allergens, restrictions };
}

function emptyPagination(count: number): PaginationUi {
  return {
    page: 1,
    limit: count,
    count,
    total: count,
    totalPages: 1,
    nextPage: null,
    previousPage: null,
  };
}

function judgementToUi(
  menuId: string,
  status: JudgementStatus,
  reasons: ReasoningRowUi[],
): JudgementUi {
  return {
    componentId: menuId,
    status: status === "check" ? "check" : status,
    reasons,
    problemIngredients: [],
    unknownItems: [],
    unknownMessages: [],
    sources: [],
    preferenceScore: 0,
    sortKey: [],
  };
}

function mockJudge(menuId: string): JudgementUi {
  const menu = MENUS.find((m) => m.id === menuId);
  if (!menu) {
    return judgementToUi(menuId, "check", []);
  }
  const profile = profileFromCriteria(mockCriteria);
  const j = judgeMenu(menu, profile);
  const reasons: ReasoningRowUi[] = j.reasons.map((r) => ({
    label: r.condition,
    conditionCode: r.condition,
    status: reasonResultToTone(r.result) === "mismatch"
      ? "mismatch"
      : reasonResultToTone(r.result) === "check"
        ? "check"
        : "match",
    detail: r.result,
    unknownItems: [],
    ruleSource: "",
  }));
  return judgementToUi(menu.id, j.status, reasons);
}

export const mockProvider: DataProvider = {
  mode: "mock",

  async getSession(): Promise<ApiSession> {
    return { csrf_token: "mock-csrf", identity: "guest_session" };
  },

  async getDietaryCriteria(): Promise<ApiDietaryCriterion[]> {
    return [
      {
        code: "allergen-milk",
        name: allergenLabel("milk"),
        kind: "allergen",
        category: "",
      },
      {
        code: "exclude-pork",
        name: restrictionLabel("pork"),
        kind: "restriction",
        category: "육류",
      },
    ];
  },

  async getProfile(): Promise<ApiProfile> {
    return {
      criteria: [...mockCriteria],
      setup_completed: mockSetupCompleted,
    };
  },

  async putProfile(criteria) {
    mockCriteria = [...criteria];
    mockSetupCompleted = true;
    return this.getProfile();
  },

  async getMenus(params = {}) {
    const origin = {
      lat: params.lat ?? SCH_ORIGIN.lat,
      lng: params.lng ?? SCH_ORIGIN.lng,
      label: "mock",
    };
    let list = [...MENUS];
    if (params.q) {
      const q = params.q;
      list = list.filter((m) => m.name.includes(q));
    }
    const items: MenuListItemUi[] = list.map((m) => {
      const store = STORES.find((s) => s.id === m.storeId);
      const judgement = mockJudge(m.id);
      return {
        id: m.id,
        name: m.name,
        restaurantId: store?.id ?? "",
        restaurantName: store?.name ?? "",
        priceAmount: m.price,
        currency: "KRW",
        category: m.category,
        distanceKm: store ? distanceFrom(store, origin) : null,
        saved: mockFavorites.size
          ? [...mockFavorites.values()].includes(m.id)
          : false,
        judgement,
      };
    });
    return { items, pagination: emptyPagination(items.length) };
  },

  async getMenu(menuId): Promise<MenuDetailUi> {
    const m = MENUS.find((x) => x.id === menuId);
    const store = m ? STORES.find((s) => s.id === m.storeId) : undefined;
    if (!m) {
      return {
        id: menuId,
        name: "",
        restaurantId: "",
        restaurantName: "",
        priceAmount: 0,
        category: "",
        distanceKm: null,
        lat: null,
        lng: null,
        allergenInformation: null,
        components: [],
        optionGroups: [],
      };
    }
    return {
      id: m.id,
      name: m.name,
      restaurantId: store?.id ?? "",
      restaurantName: store?.name ?? "",
      priceAmount: m.price,
      category: m.category,
      distanceKm: null,
      lat: store?.lat ?? null,
      lng: store?.lng ?? null,
      allergenInformation: { confirmedAllergens: m.confirmedAllergens },
      components: [],
      optionGroups: [],
    };
  },

  async getRestaurants(): Promise<{
    items: RestaurantUi[];
    pagination: PaginationUi;
  }> {
    const items: RestaurantUi[] = STORES.map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      distanceKm: distanceFrom(s, SCH_ORIGIN),
      address: s.district,
      phone: null,
      map: {
        kakaoMapUrl: null,
        kakaoDirectionsUrl: null,
        walkingDirectionsUrl: null,
        mapUrl: null,
      },
    }));
    return { items, pagination: emptyPagination(items.length) };
  },

  async postJudgement(menuId) {
    return mockJudge(menuId);
  },

  async postRecommendationsRank(menuIds) {
    return menuIds.map((id) => mockJudge(id));
  },

  async postCommunication(components) {
    const first = components[0];
    const j = first ? mockJudge(first.id) : mockJudge("");
    return {
      status: j.status,
      text: `mock 안내 — ${j.reasons.map((r) => r.label).join(", ")}`,
      orderStatus: j.status,
    };
  },

  async getFavorites(): Promise<ApiFavorite[]> {
    return [...mockFavorites.entries()].map(([id, menu_id]) => ({
      id,
      menu_id,
      judgement: undefined,
    }));
  },

  async addFavorite(menuId) {
    const id = favSeq++;
    mockFavorites.set(id, menuId);
    return { id, menuId };
  },

  async removeFavorite(id) {
    mockFavorites.delete(id);
  },

  async getReviews(menuId) {
    return mockReviews.filter((r) => r.menu_id === menuId);
  },

  async createReview(input) {
    const row: ApiReview = {
      id: reviewSeq++,
      menu_id: input.menuId,
      body: input.body,
      disclosed_conditions: (input.discloseConditions ?? []).map((code) => ({
        code,
        name: code,
        kind: "allergen",
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockReviews.unshift(row);
    return row;
  },

  async postChat(): Promise<ChatResultUi> {
    return adaptChatResponse({
      message: "mock: 확인된 정보 기준으로 안내합니다.",
      state: { criteria: mockCriteria },
      result: { matched: [], needs_check: [], criteria: mockCriteria },
    });
  },
};
