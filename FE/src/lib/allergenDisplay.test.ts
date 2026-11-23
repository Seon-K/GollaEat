import { describe, expect, it } from "vitest";
import { allergenDisplay, STORE_CONFIRMATION_NOTICE } from "./allergenDisplay";

describe("API allergen presentation", () => {
  it("shows brand allergen labels and deduplicates known declaration tags", () => {
    expect(allergenDisplay({ declarations: [{ verification_status: "verified", presence: "present", canonical_tag: "milk" }],
      brand_reference: { allergens_contains_normalized: "우유,대두|밀", status: "reference" } }))
      .toEqual({ labels: ["우유", "대두", "밀"], brandReference: true });
    expect(STORE_CONFIRMATION_NOTICE).toContain("주문 전 매장");
  });
  it("does not show absent/unverified declarations or analysis ingredients as confirmed labels", () => {
    expect(allergenDisplay({ declarations: [{ verification_status: "verified", presence: "absent", canonical_tag: "milk" },
      { verification_status: "unverified", presence: "present", canonical_tag: "soy" }],
      analysis_reference: { explicit_ingredients: ["egg"] } }).labels).toEqual([]);
  });
  it("treats absent or malformed API data as missing information, never allergen-free", () => {
    for (const value of [null, {}, "없음", { allergens_contains_normalized: null }, { declarations: [null, 4], brand_reference: [] }]) {
      expect(allergenDisplay(value)).toEqual({ labels: [], brandReference: false });
    }
  });
});
