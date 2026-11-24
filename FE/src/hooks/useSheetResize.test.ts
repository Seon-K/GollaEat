// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import type { PointerEvent, RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSheetResize } from "./useSheetResize";

beforeEach(() => vi.stubGlobal("innerHeight", 1000));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mountSheet() {
  const ref = { current: { getBoundingClientRect: () => ({ height: 380 }) } } as RefObject<HTMLElement | null>;
  const target = { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() };
  const event = (y: number) => ({ button: 0, pointerId: 1, clientY: y, currentTarget: target }) as unknown as PointerEvent<HTMLButtonElement>;
  return { ...renderHook(() => useSheetResize(ref, [10, 38, 58, 76])), event };
}
describe("sheet drag responsiveness", () => {
  it("keeps a moderate drag's released height instead of jumping back", () => {
    const { result, event } = mountSheet();
    act(() => result.current.handleProps.onPointerDown(event(500)));
    act(() => result.current.handleProps.onPointerMove(event(470)));
    expect(result.current.height).toBe("410px");
    act(() => result.current.handleProps.onPointerUp(event(470)));
    expect(result.current.height).toBe("410px");
    act(() => result.current.handleProps.onClick());
    expect(result.current.height).toBe("410px");
  });
  it("snaps only near a preset and lets keyboard controls reset a free height", () => {
    const { result, event } = mountSheet();
    act(() => result.current.handleProps.onPointerDown(event(500)));
    act(() => result.current.handleProps.onPointerMove(event(310)));
    act(() => result.current.handleProps.onPointerUp(event(310)));
    expect(result.current.height).toBe("58dvh");
    act(() => result.current.setSnap(0));
    expect(result.current.atMinimum).toBe(true);
  });
  it("ignores slight hand movement and clamps dragging at the maximum", () => {
    const { result, event } = mountSheet();
    act(() => result.current.handleProps.onPointerDown(event(500)));
    act(() => result.current.handleProps.onPointerMove(event(495)));
    expect(result.current.dragging).toBe(false);
    act(() => result.current.handleProps.onPointerMove(event(-500)));
    expect(result.current.height).toBe("760px");
    act(() => result.current.handleProps.onPointerUp(event(-500)));
    expect(result.current.atMaximum).toBe(true);
  });
});
