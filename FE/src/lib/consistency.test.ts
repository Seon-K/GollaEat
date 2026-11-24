import { describe, expect, it } from "vitest";
import { DEMO_PROFILE, MENUS } from "@/data/mock";
import {
  createInitialContext,
  runAiQuery,
  search,
} from "@/lib/aiEngine";
import { judgeMenu } from "@/lib/judge";
import type { DietProfile } from "@/types";

function statusesFor(profile: DietProfile) {
  return Object.fromEntries(
    MENUS.map((m) => [m.id, judgeMenu(m, profile).status]),
  );
}

describe("프로필 변경 시 목록·AI 일관성", () => {
  it("견과류 해제해도 토마토 파스타는 새우·우유로 mismatch 유지", () => {
    const profile: DietProfile = {
      allergens: ["milk", "shrimp"],
      restrictions: [...DEMO_PROFILE.restrictions],
    };
    const s = statusesFor(profile);
    expect(s["mushroom-salad"]).toBe("match");
    expect(s["tomato-pasta"]).toBe("mismatch");
  });

  it("토마토 추가 시 explore 판정과 AI search 상태가 같다", () => {
    const profile: DietProfile = {
      allergens: ["nuts", "milk", "shrimp", "tomato"],
      restrictions: [...DEMO_PROFILE.restrictions],
    };
    const explore = statusesFor(profile);
    const ctx = {
      ...createInitialContext(profile),
      radiusKm: 5,
      checkOnly: false,
      menuKeyword: null,
    };
    // mismatch는 AI에서 숨김 — match/check만 비교
    const aiHits = search(ctx);
    for (const hit of aiHits) {
      expect(hit.status).toBe(explore[hit.menu.id]);
      expect(hit.status).not.toBe("mismatch");
    }
    expect(explore["mushroom-salad"]).toBe("mismatch");
    expect(aiHits.every((h) => h.menu.id !== "mushroom-salad")).toBe(true);
  });

  it("AI 쿼리도 sessionProfile 기준으로 판정한다", () => {
    const base = createInitialContext({
      allergens: [...DEMO_PROFILE.allergens],
      restrictions: [...DEMO_PROFILE.restrictions],
    });
    const { response } = runAiQuery(
      "순천향대 근처에서 먹을 수 있는 점심은?",
      base,
    );
    const matchIds = response.groups
      .find((g) => g.status === "match")
      ?.items.map((i) => i.menu.id);
    expect(matchIds).toContain("mushroom-salad");
  });
});
