// @vitest-environment jsdom
import { RESTRICTIONS, normalizeRestrictionIds } from "@/data/restrictions";
import SetupRestrictionPage from "@/pages/SetupRestrictionPage";
import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import snapshot from "./__fixtures__/get_dietary_criteria.json";
import { ALLERGENS, allergenLabel, normalizeAllergenIds } from "@/data/allergens";
import { profileToCriteriaCodes, criteriaCodesToProfile } from "./criteriaMap";
import { useProfileStore } from "@/store/profileStore";
import SetupAllergenPage from "@/pages/SetupAllergenPage";

afterEach(() => { cleanup(); localStorage.clear(); });
describe("backend allergen contract", () => {
  it("matches every backend allergen code and display name", () => {
    const expected = snapshot.body.criteria.filter((item) => item.kind === "allergen").map(({ code, name }) => ({ code, name }));
    expect(ALLERGENS.map(({ id, label }) => ({ code: `allergen-${id}`, name: label }))).toEqual(expected);
    expect(ALLERGENS).toHaveLength(17);
  });
  it.each(ALLERGENS)("preserves $label across save and hydration", ({ id }) => {
    const original = { allergens: [id], restrictions: [] };
    expect(criteriaCodesToProfile(profileToCriteriaCodes(original))).toEqual(original);
  });
  it("normalizes and deduplicates the previous 19-item selections", () => {
    expect(normalizeAllergenIds(["peanut", "walnut", "pinenut", "nuts", "sulfite", "milk"]))
      .toEqual(["nuts", "sulfites", "milk"]);
    expect(allergenLabel("walnut")).toBe("견과류");
  });
  it("rehydrates existing browser profiles without dropping nuts or sulfites", async () => {
    localStorage.setItem("gollaeat-profile", JSON.stringify({ version: 0, state: {
      allergens: ["walnut", "pinenut", "peanut", "sulfite"], restrictions: ["pork"], completed: true,
    } }));
    await useProfileStore.persist.rehydrate();
    const profile = useProfileStore.getState().getProfile();
    expect(profile).toEqual({ allergens: ["nuts", "sulfites"], restrictions: ["pork"] });
    expect(profileToCriteriaCodes(profile)).toEqual(["allergen-nuts", "allergen-sulfites", "exclude-pork"]);
  });
  it("presents the backend group instead of three independently selectable nuts", () => {
    useProfileStore.setState({ allergens: [], restrictions: [] });
    render(h(MemoryRouter, null, h(SetupAllergenPage)));
    expect(screen.getByText("알레르겐 17종 · 서버 기준")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "땅콩" })).toBeNull();
    expect(screen.queryByRole("button", { name: "호두" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "알레르겐 검색" }), { target: { value: "호두" } });
    expect(screen.queryByRole("button", { name: "우유" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "견과류" }));
    expect(useProfileStore.getState().allergens).toEqual(["nuts"]);
  });
});


describe("backend ingredient restriction contract", () => {
  it("matches all server restriction codes, names and categories", () => {
    const expected = snapshot.body.criteria.filter((item) => item.kind === "ingredient")
      .map(({ code, name, category }) => ({ code, name, category }));
    expect(RESTRICTIONS.map(({ id, label, category }) => ({
      code: `exclude-${id.replaceAll("_", "-")}`, name: label, category,
    }))).toEqual(expected);
    expect(RESTRICTIONS).toHaveLength(12);
  });
  it.each(RESTRICTIONS)("preserves $label across save and restore", ({ id }) => {
    const profile = { allergens: [], restrictions: [id] };
    expect(criteriaCodesToProfile(profileToCriteriaCodes(profile))).toEqual(profile);
  });
  it("removes unsupported persisted broth without dropping supported restrictions", async () => {
    localStorage.setItem("gollaeat-profile", JSON.stringify({ version: 0, state: {
      allergens: ["milk"], restrictions: ["animal_broth", "pork", "cheese_butter"], completed: true,
    } }));
    await useProfileStore.persist.rehydrate();
    const profile = useProfileStore.getState().getProfile();
    expect(profile.restrictions).toEqual(["pork", "cheese_butter"]);
    expect(profileToCriteriaCodes(profile)).toEqual(["allergen-milk", "exclude-pork", "exclude-cheese-butter"]);
    expect(normalizeRestrictionIds(["animal_broth"])).toEqual([]);
  });
  it("offers only supported restrictions in condition setup", () => {
    useProfileStore.setState({ allergens: [], restrictions: [] });
    render(h(MemoryRouter, null, h(SetupRestrictionPage)));
    expect(screen.queryByRole("button", { name: "동물성 육수" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "젤라틴" }));
    expect(profileToCriteriaCodes(useProfileStore.getState().getProfile())).toEqual(["exclude-gelatin"]);
  });
});
