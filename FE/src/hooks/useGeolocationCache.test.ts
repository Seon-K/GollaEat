// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGeolocation } from "./useGeolocation";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reuses a recent location on tab return and allows an explicit refresh", async () => {
  let complete!: PositionCallback;
  const getCurrentPosition = vi.fn((success: PositionCallback) => { complete = success; });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  const first = renderHook(() => useGeolocation({ autoRequest: true }));
  const coords = { coords: { latitude: 36.8, longitude: 127.1 } } as GeolocationPosition;
  await act(async () => { complete(coords); });
  expect(first.result.current.position).toEqual({ lat: 36.8, lng: 127.1 });
  first.unmount();
  const second = renderHook(() => useGeolocation({ autoRequest: true }));
  expect(second.result.current.status).toBe("success");
  expect(second.result.current.position).toEqual({ lat: 36.8, lng: 127.1 });
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  act(() => second.result.current.request());
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  await act(async () => { complete(coords); });
});
