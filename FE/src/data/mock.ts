import type { GeoPoint, Menu, Review, Store } from "@/types";

/**
 * 기준 좌표
 * - ASAN_ORIGIN: 탐색 화면 "충남 아산시" 현재 위치
 * - SCH_ORIGIN: AI 화면 "순천향대" 중심
 *
 * 매장 좌표는 Haversine 직선거리가 디자인 수치에 맞도록 배치
 * 탐색: 그린키친 0.8km / 온기국수 1.2km / 파스타하우스 2.1km
 * AI: 그린키친 320m / 온기국수 150m / 김밥마을 300m
 */
export const ASAN_ORIGIN: GeoPoint = {
  lat: 36.76370914943235,
  lng: 126.94133077347817,
  label: "충남 아산시",
};

export const SCH_ORIGIN: GeoPoint = {
  lat: 36.7698,
  lng: 126.9316,
  label: "순천향대",
};

/**
 * AI 장소 변경용 mock 좌표 (온양온천역)
 * 실제 GPS가 아니라 SCH 클러스터 기준으로 1km/2km 결과가 달라지도록 배치
 * 1km: 그린키친·온기국수 / 2km: +김밥마을·파스타하우스
 */
export const ONYANG_ORIGIN: GeoPoint = {
  lat: 36.772,
  lng: 126.942,
  label: "온양온천역",
};

export const STORES: Store[] = [
  {
    id: "green-kitchen",
    name: "그린키친",
    district: "아산시 배방읍",
    lat: 36.76881567677625,
    lng: 126.93497588193213,
    category: "western",
  },
  {
    id: "ongi-noodle",
    name: "온기국수",
    district: "아산시 온천동",
    lat: 36.77106762742698,
    lng: 126.93217597966873,
    category: "korean",
  },
  {
    id: "pasta-house",
    name: "파스타하우스",
    district: "아산시 배방읍",
    lat: 36.77315028189411,
    lng: 126.96174937225805,
    category: "western",
  },
  {
    id: "kimbap-village",
    name: "김밥마을",
    district: "아산시 신창면",
    lat: 36.76887719977196,
    lng: 126.9284351081493,
    category: "snack",
  },
];

export const MENUS: Menu[] = [
  {
    id: "mushroom-salad",
    storeId: "green-kitchen",
    name: "버섯 샐러드",
    price: 9900,
    category: "western",
    confirmedIngredients: ["양상추", "버섯", "토마토", "올리브오일"],
    confirmedAllergens: [],
    unconfirmed: [],
    hasIngredientInfo: true,
    source: "매장 안내",
    verifiedAt: "2026.10.24",
  },
  {
    id: "janchi-guksu",
    storeId: "ongi-noodle",
    name: "잔치국수",
    price: 7500,
    category: "korean",
    confirmedIngredients: ["소면", "파", "김"],
    confirmedAllergens: ["밀"],
    unconfirmed: ["육수", "소스"],
    hasIngredientInfo: true,
    source: "매장 안내",
    verifiedAt: "2026.10.20",
  },
  {
    id: "tomato-pasta",
    storeId: "pasta-house",
    name: "토마토 파스타",
    price: 12000,
    category: "western",
    confirmedIngredients: ["면", "토마토소스", "새우", "파마산치즈", "버터"],
    /** 기본 프로필(땅콩·우유·새우) 기준 mismatch */
    confirmedAllergens: ["밀", "새우", "우유"],
    unconfirmed: [],
    hasIngredientInfo: true,
    source: "매장 안내",
    verifiedAt: "2026.10.18",
  },
  {
    id: "tuna-kimbap",
    storeId: "kimbap-village",
    name: "참치김밥",
    price: 4500,
    category: "snack",
    confirmedIngredients: [],
    confirmedAllergens: [],
    unconfirmed: [],
    hasIngredientInfo: false,
    source: "미확인",
    verifiedAt: "2026.09.01",
  },
];

export const INITIAL_REVIEWS: Review[] = [
  {
    id: "r1",
    menuId: "mushroom-salad",
    author: "김**",
    restrictionLabel: "땅콩 제한",
    content: "육수 재료가 궁금해서 매장에 문의했어요.",
    avatarTone: "mint",
    createdAt: "2026-10-20",
  },
  {
    id: "r2",
    menuId: "mushroom-salad",
    author: "이**",
    restrictionLabel: "우유 제한",
    content: "직원에게 소스의 유제품 여부를 확인했습니다.",
    avatarTone: "peach",
    createdAt: "2026-10-22",
  },
];

/** 디자인·테스트용 기본 식이 프로필 (땅콩·우유·새우 + 소고기·돼지고기·동물성 육수) */
export const DEMO_PROFILE = {
  allergens: ["peanut", "milk", "shrimp"] as const,
  restrictions: ["beef", "pork", "animal_broth"] as const,
};

export const getStore = (id: string): Store | undefined =>
  STORES.find((s) => s.id === id);

export const getMenu = (id: string): Menu | undefined =>
  MENUS.find((m) => m.id === id);

export const getMenusByStore = (storeId: string): Menu[] =>
  MENUS.filter((m) => m.storeId === storeId);
