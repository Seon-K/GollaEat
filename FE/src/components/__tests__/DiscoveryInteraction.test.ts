// @vitest-environment jsdom
import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExploreSelect } from "../ExploreSelect";
import { MapResultsSheet } from "../MapResultsSheet";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const options = [{ id: "all", label: "전체" }, { id: "korean", label: "한식" }];
function select(onChange = vi.fn()) {
  render(h(ExploreSelect, { triggerLabel: "필터", options, value: "all", onChange }));
  return { onChange, trigger: screen.getByRole("button", { name: "필터" }) };
}

describe("filter pointer lifecycle", () => {
  it("keeps the portal open through mobile blur and selects an option", () => {
    const { trigger, onChange } = select();
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: "한식" });
    fireEvent.blur(screen.getByRole("option", { name: "전체" }), { relatedTarget: null });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("korean");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("closes on the same trigger and outside touch without selecting", () => {
    const { trigger, onChange } = select();
    fireEvent.click(trigger);
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("does not scroll the page when moving focus and preserves option scrolling", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { trigger } = select();
    fireEvent.click(trigger);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    fireEvent.scroll(screen.getByRole("listbox"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("option", { name: "전체" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("map sheet heights and dropdown direction", () => {
  it("collapses to its title and opens filters downwards when raised", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    render(h(MapResultsSheet, { expanded: false, controlsHeight: 120, onHeightChange: vi.fn(),
      title: "이 지도에서 추천하는 식당", subtitle: "총 86곳", children: h("p", null, "식당 목록"),
      controls: (side) => h("span", null, `dropdown-${side}`) }));
    expect(screen.getByText("dropdown-top")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "식당 목록 높이 조절" }), { key: "Home" });
    expect(screen.getByRole("heading", { name: "이 지도에서 추천하는 식당" })).toBeTruthy();
    expect(screen.queryByText("총 86곳")).toBeNull();
    expect(screen.queryByText("dropdown-top")).toBeNull();
    expect(screen.getByText("식당 목록").parentElement?.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "목록 펼치기" }));
    expect(screen.getByText("dropdown-bottom")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "목록 접기" }));
    expect(screen.queryByText("총 86곳")).toBeNull();
  });
});
