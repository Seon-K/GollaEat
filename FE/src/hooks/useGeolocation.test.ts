import { describe, expect, it } from "vitest";
import { locate } from "./useGeolocation";

describe("browser location boundary", () => {
  it("uses one location request with a timeout and returns coordinates", async () => {
    const point = await locate({ getCurrentPosition: (success, _error, options) => {
      expect(options).toEqual({ timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
      success({ coords: { latitude: 36.78, longitude: 127.0 } } as GeolocationPosition);
    } });
    expect(point).toEqual({ lat: 36.78, lng: 127 });
  });
  it.each([[1, "denied"], [2, "error"], [3, "timeout"]])("handles geolocation error %s", async (code, status) => {
    await expect(locate({ getCurrentPosition: (_success, error) => {
      error?.({ code } as GeolocationPositionError);
    } })).rejects.toMatchObject({ status });
  });
  it("handles unsupported browsers without requesting location", async () => {
    await expect(locate()).rejects.toMatchObject({ status: "unsupported" });
  });
});
