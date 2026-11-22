import { describe, expect, it } from "vitest";
import { DEMO_PROFILE } from "@/data/mock";
import {
  createInitialContext,
  parseIntent,
  runAiQuery,
  search,
} from "@/lib/aiEngine";

describe("aiEngine", () => {
  it("parseIntent → search → buildResponse: 순천향대 점심", () => {
    const ctx = createInitialContext({ ...DEMO_PROFILE, allergens: [...DEMO_PROFILE.allergens], restrictions: [...DEMO_PROFILE.restrictions] });
    const { response, context } = runAiQuery(
      "순천향대 근처에서 먹을 수 있는 점심은?",
      ctx,
    );
    expect(context.locationKey).toBe("sch");
    expect(context.radiusKm).toBe(1);
    expect(response.groups.some((g) => g.status === "match")).toBe(true);
    expect(response.groups.some((g) => g.status === "check")).toBe(true);
    expect(
      response.groups.every((g) => g.status !== "mismatch"),
    ).toBe(true);
    expect(response.staffPhrase).toBeNull();
  });

  it("김밥만 보여줘 → 필터 + 직원 문구", () => {
    let ctx = createInitialContext({
      allergens: [...DEMO_PROFILE.allergens],
      restrictions: [...DEMO_PROFILE.restrictions],
    });
    ctx = runAiQuery("순천향대 근처 점심", ctx).context;
    const { response, context } = runAiQuery("김밥만 보여줘", ctx);
    expect(context.menuKeyword).toBe("김밥");
    expect(response.groups.every((g) =>
      g.items.every((h) => h.menu.name.includes("김밥")),
    )).toBe(true);
    expect(response.staffPhrase?.menuName).toBe("참치김밥");
    expect(response.contextChips.some((c) => c.label === "기존 프로필 적용")).toBe(
      true,
    );
  });

  it("범위 확장 2km", () => {
    const ctx = createInitialContext({
      allergens: [...DEMO_PROFILE.allergens],
      restrictions: [...DEMO_PROFILE.restrictions],
    });
    const { context } = runAiQuery("범위 넓히기 · 1km보다 넓게 탐색", ctx);
    expect(context.radiusKm).toBe(2);
  });

  it("온양온천역 장소 변경", () => {
    const ctx = createInitialContext({
      allergens: [...DEMO_PROFILE.allergens],
      restrictions: [...DEMO_PROFILE.restrictions],
    });
    const { context, response } = runAiQuery(
      "온양온천역 근처로 변경",
      ctx,
    );
    expect(context.locationKey).toBe("onyang");
    expect(response.contextChips.some((c) => c.label.includes("온양온천역"))).toBe(
      true,
    );
  });

  it("새우는 빼줘 → sessionProfile만 변경", () => {
    const base = {
      allergens: [...DEMO_PROFILE.allergens],
      restrictions: [...DEMO_PROFILE.restrictions],
    };
    const ctx = createInitialContext(base);
    const { intent, context } = parseIntent("새우는 빼줘", ctx);
    expect(intent.type).toBe("modify_profile");
    expect(context.sessionProfile.allergens).not.toContain("shrimp");
    expect(context.profileModified).toBe(true);
    expect(base.allergens).toContain("shrimp");
  });

  it("섹션 내부는 가까운 순", () => {
    const ctx = createInitialContext({
      allergens: [...DEMO_PROFILE.allergens],
      restrictions: [...DEMO_PROFILE.restrictions],
    });
    const hits = search({
      ...ctx,
      locationKey: "sch",
      radiusKm: 1,
      checkOnly: false,
      menuKeyword: null,
    });
    const check = hits.filter((h) => h.status === "check");
    for (let i = 1; i < check.length; i++) {
      expect(check[i].distanceKm).toBeGreaterThanOrEqual(check[i - 1].distanceKm);
    }
  });
});
