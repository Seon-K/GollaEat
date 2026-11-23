import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { homeRestaurantsOptions } from "./homeRestaurants";
import { apiKeys } from "./keys";

const { getRestaurants } = vi.hoisted(() => ({ getRestaurants: vi.fn() }));
vi.mock("./providers", () => ({ getDataProvider: () => ({ getRestaurants }) }));

describe("home restaurant page caching", () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getRestaurants.mockReset().mockResolvedValue({ items: [], pagination: { page: 1, limit: 10, count: 0, total: 45, totalPages: 5, nextPage: 2, previousPage: null } });
  });
  afterEach(() => { client.clear(); vi.useRealTimers(); });

  it("revisits loaded pages without another API request after 30 seconds or remount", async () => {
    const first = homeRestaurantsOptions({ region: "아산시", page: 1 }, "milk");
    const second = homeRestaurantsOptions({ region: "아산시", page: 2 }, "milk");
    await client.fetchQuery(first);
    await client.fetchQuery(second);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await client.fetchQuery(first);
    expect(getRestaurants).toHaveBeenCalledTimes(2);
    expect(getRestaurants).toHaveBeenNthCalledWith(1, { region: "아산시", page: 1, limit: 10, view: "card" });
    expect(getRestaurants).toHaveBeenNthCalledWith(2, { region: "아산시", page: 2, limit: 10, view: "card" });
    const observer = new QueryObserver(client, first);
    const stop = observer.subscribe(() => {});
    expect(observer.getCurrentResult().isFetching).toBe(false);
    expect(observer.getCurrentResult().isPending).toBe(false);
    expect(getRestaurants).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps filter/profile pages separate and honors explicit invalidation", async () => {
    const first = homeRestaurantsOptions({ page: 1, judgement_status: "match" }, "milk");
    await client.fetchQuery(first);
    await client.fetchQuery(homeRestaurantsOptions({ page: 1, judgement_status: "mismatch" }, "milk"));
    await client.fetchQuery(homeRestaurantsOptions({ page: 1, judgement_status: "match" }, "egg"));
    await client.fetchQuery(first);
    expect(getRestaurants).toHaveBeenCalledTimes(3);
    await client.invalidateQueries({ queryKey: apiKeys.restaurants().slice(0, 2) });
    await client.fetchQuery(first);
    expect(getRestaurants).toHaveBeenCalledTimes(4);
  });

});
