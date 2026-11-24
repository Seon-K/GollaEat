import { describe, expect, it } from "vitest";
import {
  ASAN_ORIGIN,
  DEMO_PROFILE,
  getMenu,
  getStore,
  MENUS,
  SCH_ORIGIN,
  STORES,
} from "@/data/mock";
import { distanceFrom, formatDistance, haversineKm } from "@/lib/geo";
import { judgeMenu } from "@/lib/judge";
import type { DietProfile } from "@/types";

const profile: DietProfile = {
  allergens: [...DEMO_PROFILE.allergens],
  restrictions: [...DEMO_PROFILE.restrictions],
};

describe("judgeMenu", () => {
  it("서버와 동일하게 제한 조건이 없으면 모든 메뉴를 일치로 표시", () => {
    for (const menu of MENUS) {
      expect(judgeMenu(menu, { allergens: [], restrictions: [] })).toEqual({ status: "match", reasons: [] });
    }
  });
  it("버섯 샐러드 → match (확인 재료만, 제한 성분 없음)", () => {
    const menu = getMenu("mushroom-salad")!;
    const j = judgeMenu(menu, profile);
    expect(j.status).toBe("match");
    expect(j.reasons.find((r) => r.condition === "견과류")?.result).toBe(
      "포함 정보 없음 · 재료 정보 확인",
    );
    expect(j.reasons.find((r) => r.condition === "우유")?.result).toBe(
      "포함 정보 없음 · 재료 정보 확인",
    );
    expect(j.reasons.find((r) => r.condition === "새우")?.result).toBe(
      "포함 정보 없음 · 재료 정보 확인",
    );
    expect(j.reasons.some((r) => r.condition === "동물성 육수")).toBe(false);
  });

  it("잔치국수 → check (육수·소스 미확인)", () => {
    const menu = getMenu("janchi-guksu")!;
    const j = judgeMenu(menu, profile);
    expect(j.status).toBe("check");
    expect(menu.unconfirmed).toEqual(expect.arrayContaining(["육수", "소스"]));
    expect(j.reasons.some((r) => r.condition === "동물성 육수")).toBe(false);
  });

  it("토마토 파스타 → mismatch (새우·우유 포함 확인)", () => {
    const menu = getMenu("tomato-pasta")!;
    const j = judgeMenu(menu, profile);
    expect(j.status).toBe("mismatch");
    expect(j.reasons.find((r) => r.condition === "새우")?.result).toBe(
      "포함 확인됨",
    );
    expect(j.reasons.find((r) => r.condition === "우유")?.result).toBe(
      "포함 확인됨",
    );
  });

  it("참치김밥 → check (재료 정보 없음)", () => {
    const menu = getMenu("tuna-kimbap")!;
    const j = judgeMenu(menu, profile);
    expect(j.status).toBe("check");
    expect(menu.hasIngredientInfo).toBe(false);
    expect(j.reasons.every((r) => r.result === "정보 없음")).toBe(true);
  });

  it("우선순위: mismatch > check > match", () => {
    const statuses = MENUS.map((m) => judgeMenu(m, profile).status);
    expect(statuses).toEqual(["match", "check", "mismatch", "check"]);
  });

  it("갑각류 제한은 새우·게로 확장된다", () => {
    const menu = getMenu("tomato-pasta")!;
    const j = judgeMenu(menu, {
      allergens: [],
      restrictions: ["crustacean"],
    });
    expect(j.status).toBe("mismatch");
    expect(j.reasons.find((r) => r.condition === "갑각류")?.result).toBe(
      "포함 확인됨",
    );
  });

  it("견과류 해제 시 버섯 샐러드는 계속 match", () => {
    const menu = getMenu("mushroom-salad")!;
    const j = judgeMenu(menu, {
      allergens: ["milk", "shrimp"],
      restrictions: [...DEMO_PROFILE.restrictions],
    });
    expect(j.status).toBe("match");
    expect(j.reasons.some((r) => r.condition === "견과류")).toBe(false);
  });

  it("토마토 알레르겐 추가 시 버섯 샐러드는 mismatch", () => {
    const menu = getMenu("mushroom-salad")!;
    const j = judgeMenu(menu, {
      allergens: ["nuts", "milk", "shrimp", "tomato"],
      restrictions: [...DEMO_PROFILE.restrictions],
    });
    expect(j.status).toBe("mismatch");
    expect(j.reasons.find((r) => r.condition === "토마토")?.result).toBe(
      "포함 확인됨",
    );
  });

  it("프로필 변경 시 전체 메뉴 상태가 일관된다", () => {
    const withTomato: DietProfile = {
      allergens: ["nuts", "milk", "shrimp", "tomato"],
      restrictions: [...DEMO_PROFILE.restrictions],
    };
    const statuses = Object.fromEntries(
      MENUS.map((m) => [m.id, judgeMenu(m, withTomato).status]),
    );
    expect(statuses["mushroom-salad"]).toBe("mismatch");
    expect(statuses["janchi-guksu"]).toBe("check");
    expect(statuses["tomato-pasta"]).toBe("mismatch");
    expect(statuses["tuna-kimbap"]).toBe("check");
  });
});

describe("Haversine 거리 (mock 좌표)", () => {
  const tolKm = 0.06; // ±60m

  it("탐색(아산시) 기준: 0.8 / 1.2 / 2.1 km", () => {
    const green = getStore("green-kitchen")!;
    const ongi = getStore("ongi-noodle")!;
    const pasta = getStore("pasta-house")!;

    expect(distanceFrom(green, ASAN_ORIGIN)).toBeCloseTo(0.8, 1);
    expect(Math.abs(distanceFrom(ongi, ASAN_ORIGIN) - 1.2)).toBeLessThan(tolKm);
    expect(distanceFrom(pasta, ASAN_ORIGIN)).toBeCloseTo(2.1, 1);

    expect(formatDistance(distanceFrom(green, ASAN_ORIGIN), "km")).toBe(
      "0.8km",
    );
    expect(formatDistance(distanceFrom(ongi, ASAN_ORIGIN), "km")).toBe(
      "1.2km",
    );
    expect(formatDistance(distanceFrom(pasta, ASAN_ORIGIN), "km")).toBe(
      "2.1km",
    );
  });

  it("AI(순천향대) 기준: 320m / 150m / 300m", () => {
    const green = getStore("green-kitchen")!;
    const ongi = getStore("ongi-noodle")!;
    const kimbap = getStore("kimbap-village")!;

    expect(formatDistance(distanceFrom(green, SCH_ORIGIN), "m")).toBe("320m");
    expect(formatDistance(distanceFrom(ongi, SCH_ORIGIN), "m")).toBe("150m");
    expect(formatDistance(distanceFrom(kimbap, SCH_ORIGIN), "m")).toBe("300m");
  });

  it("STORES 좌표가 기준점과 일치한다", () => {
    expect(STORES).toHaveLength(4);
    expect(haversineKm(ASAN_ORIGIN, ASAN_ORIGIN)).toBe(0);
    expect(haversineKm(SCH_ORIGIN, SCH_ORIGIN)).toBe(0);
  });
});
