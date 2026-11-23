import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RestaurantCard } from "./RestaurantCard";
import type { RestaurantUi } from "@/lib/api/adapters";

const restaurant: RestaurantUi = {
  id: "s", name: "식당", address: "아산시", lat: 36, lng: 127, distanceKm: null, phone: null,
  map: { kakaoMapUrl: null, kakaoDirectionsUrl: null, walkingDirectionsUrl: null, mapUrl: null },
  personalization: { applied: true, profile_configured: true },
  dietarySummary: { match_menu_count: 2, mismatch_menu_count: 3, check_menu_count: 4 },
};
describe("restaurant verdict counts", () => {
  it("shows three distinct icon/color badges with their actual menu counts", () => {
    const html = renderToStaticMarkup(createElement(RestaurantCard, { restaurant, selected: false, onSelect() {}, showDistance: false }));
    for (const text of ["일치 2개", "불일치 3개", "추가 확인 필요 4개", "text-primary", "text-error", "text-accent-text", "lucide-circle-check", "lucide-circle-x", "lucide-triangle-alert"]) expect(html).toContain(text);
  });
  it.each(["match", "mismatch", "check"] as const)("shows only the selected %s verdict count", (status) => {
    const html = renderToStaticMarkup(createElement(RestaurantCard, { restaurant, status, selected: false, onSelect() {}, showDistance: false }));
    const badges = { match: "일치 2개", mismatch: "불일치 3개", check: "추가 확인 필요 4개" };
    for (const [key, text] of Object.entries(badges)) {
      if (key === status) expect(html).toContain(text);
      else expect(html).not.toContain(text);
    }
  });
  it("does not represent an unconfigured profile as a match", () => {
    const html = renderToStaticMarkup(createElement(RestaurantCard, { restaurant: { ...restaurant, personalization: { applied: false, profile_configured: false } }, selected: false, onSelect() {}, showDistance: false }));
    expect(html).toContain("식이조건 설정 후 판정 확인");
    expect(html).not.toContain("일치 2개");
  });
});
