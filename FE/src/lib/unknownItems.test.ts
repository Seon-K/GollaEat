import { describe, expect, it } from "vitest";
import { humanizeUnknownItems, humanizeUnknownTag } from "@/lib/unknownItems";

describe("humanizeUnknownTag", () => {
  it("maps bare and prefixed tags", () => {
    expect(humanizeUnknownTag("milk")).toBe("우유");
    expect(humanizeUnknownTag("allergen-milk:milk")).toBe("우유");
    expect(humanizeUnknownTag("exclude-pork:source")).toBe("정보 출처");
  });

  it("hides unknown raw keys", () => {
    expect(humanizeUnknownTag("allergen-milk:weird")).toBeNull();
  });
});

describe("humanizeUnknownItems", () => {
  it("dedupes and drops source when ingredient present", () => {
    expect(
      humanizeUnknownItems([
        "allergen-milk:milk",
        "allergen-milk:source",
        "exclude-pork:pork",
        "exclude-pork:source",
        "milk",
        "nuts",
      ]),
    ).toEqual(["우유", "돼지고기", "견과류"]);
  });
});
