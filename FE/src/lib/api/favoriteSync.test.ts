import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavoriteSync, FAVORITE_DEBOUNCE_MS } from "./favoriteSync";
import { apiKeys } from "./keys";
import type { ApiFavorite } from "./types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("optimistic favorite synchronization", () => {
  let client: QueryClient;
  let sync: FavoriteSync;
  const api = { getFavorites: vi.fn(), addFavorite: vi.fn(), removeFavorite: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    client = new QueryClient();
    client.setQueryData(apiKeys.favorites(), []);
    api.getFavorites.mockResolvedValue([]);
    api.addFavorite.mockImplementation(async (menuId: string) => ({ id: 42, menuId }));
    api.removeFavorite.mockResolvedValue(undefined);
    sync = new FavoriteSync(client, () => api);
  });
  afterEach(() => { sync.reset(); client.clear(); vi.useRealTimers(); });
  const flush = () => vi.advanceTimersByTimeAsync(FAVORITE_DEBOUNCE_MS);

  it("changes color immediately and sends only the last state after rapid clicks", async () => {
    sync.toggle("a");
    expect(sync.isSaved("a")).toBe(true);
    expect(sync.isSaving("b")).toBe(false);
    expect(api.addFavorite).not.toHaveBeenCalled();
    sync.toggle("a"); sync.toggle("a");
    await flush();
    expect(api.addFavorite).toHaveBeenCalledExactlyOnceWith("a");
    expect(api.removeFavorite).not.toHaveBeenCalled();
    expect(sync.isSaved("a")).toBe(true);
  });

  it("sends no write when the last click restores the confirmed state", async () => {
    sync.toggle("a"); sync.toggle("a");
    await flush();
    expect(sync.isSaved("a")).toBe(false);
    expect(api.addFavorite).not.toHaveBeenCalled();
    expect(api.removeFavorite).not.toHaveBeenCalled();
  });

  it("serializes an in-flight menu and converges to the last click using its real server ID", async () => {
    const request = deferred<{ id: number; menuId: string }>();
    api.addFavorite.mockReturnValue(request.promise);
    sync.toggle("a"); await flush();
    sync.toggle("a"); sync.toggle("a"); sync.toggle("a");
    expect(sync.isSaved("a")).toBe(false);
    await flush();
    expect(api.removeFavorite).not.toHaveBeenCalled();
    request.resolve({ id: 17, menuId: "a" });
    await vi.advanceTimersByTimeAsync(1);
    expect(api.addFavorite).toHaveBeenCalledTimes(1);
    expect(api.removeFavorite).toHaveBeenCalledExactlyOnceWith(17);
    expect(sync.isSaved("a")).toBe(false);
    expect(sync.isSaving("a")).toBe(false);
  });

  it("does not send another write when clicks during a request end at that request's target", async () => {
    const request = deferred<{ id: number; menuId: string }>();
    api.addFavorite.mockReturnValue(request.promise);
    sync.toggle("a"); await flush();
    sync.toggle("a"); sync.toggle("a"); await flush();
    request.resolve({ id: 17, menuId: "a" });
    await vi.advanceTimersByTimeAsync(1);
    expect(api.addFavorite).toHaveBeenCalledTimes(1);
    expect(api.removeFavorite).not.toHaveBeenCalled();
    expect(sync.isSaved("a")).toBe(true);
  });

  it("rolls back only the failed menu while another save succeeds", async () => {
    api.addFavorite.mockImplementation(async (menuId: string) => {
      if (menuId === "a") throw new Error("offline");
      return { id: 18, menuId };
    });
    sync.toggle("a"); sync.toggle("b");
    expect(sync.isSaved("a")).toBe(true);
    expect(sync.isSaved("b")).toBe(true);
    await flush();
    expect(sync.isSaved("a")).toBe(false);
    expect(sync.isSaved("b")).toBe(true);
    expect(sync.error).toBeTruthy();
    expect(client.getQueryData<ApiFavorite[]>(apiKeys.favorites())?.map((item) => item.menu_id)).toEqual(["b"]);
  });

  it("keeps pending state over an older background read and restores a failed removal", async () => {
    client.setQueryData(apiKeys.favorites(), [{ id: 7, menu_id: "a" }]);
    const request = deferred<void>(); api.removeFavorite.mockReturnValue(request.promise);
    sync.toggle("a"); await flush();
    expect(sync.isSaved("a")).toBe(false);
    expect(sync.favorites([{ id: 7, menu_id: "a" }])).toHaveLength(1);
    request.reject(new Error("offline")); await vi.advanceTimersByTimeAsync(1);
    expect(sync.isSaved("a")).toBe(true);
    expect(sync.favorites(client.getQueryData(apiKeys.favorites())!)).toHaveLength(1);
  });

  it("discards queued clicks and late responses when the session cache is cleared", async () => {
    const request = deferred<{ id: number; menuId: string }>(); api.addFavorite.mockReturnValue(request.promise);
    sync.toggle("a"); await flush(); sync.toggle("b");
    client.clear();
    request.resolve({ id: 17, menuId: "a" }); await flush();
    expect(api.addFavorite).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(apiKeys.favorites())).toBeUndefined();
    expect(sync.isSaved("a")).toBe(false);
    expect(sync.isSaved("b")).toBe(false);
  });
});
