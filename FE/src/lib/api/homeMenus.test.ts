import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { homeMenusOptions, profileSignature } from "./homeMenus";
import { apiKeys } from "./keys";
import { useDiscoveryFilters } from "@/hooks/useDiscovery";

const { getMenus } = vi.hoisted(() => ({ getMenus: vi.fn() }));
vi.mock("./providers", () => ({ getDataProvider: () => ({ getMenus }) }));

describe("home page caching", () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getMenus.mockReset().mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, count: 0, total: 45, totalPages: 3, nextPage: 2, previousPage: null } });
  });
  afterEach(() => { client.clear(); vi.useRealTimers(); });

  it("revisits loaded pages without another API request after 30 seconds or remount", async () => {
    const first = homeMenusOptions({ region: "아산시", page: 1 }, "milk");
    const second = homeMenusOptions({ region: "아산시", page: 2 }, "milk");
    await client.fetchQuery(first);
    await client.fetchQuery(second);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await client.fetchQuery(first);
    expect(getMenus).toHaveBeenCalledTimes(2);
    expect(getMenus).toHaveBeenNthCalledWith(1, { region: "아산시", page: 1, limit: 20 });
    expect(getMenus).toHaveBeenNthCalledWith(2, { region: "아산시", page: 2, limit: 20 });
    const observer = new QueryObserver(client, first);
    const stop = observer.subscribe(() => {});
    expect(observer.getCurrentResult().isFetching).toBe(false);
    expect(observer.getCurrentResult().isPending).toBe(false);
    expect(getMenus).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps filter/profile pages separate and honors explicit invalidation", async () => {
    const first = homeMenusOptions({ page: 1, judgement_status: "match" }, "milk");
    await client.fetchQuery(first);
    await client.fetchQuery(homeMenusOptions({ page: 1, judgement_status: "mismatch" }, "milk"));
    await client.fetchQuery(homeMenusOptions({ page: 1, judgement_status: "match" }, "egg"));
    await client.fetchQuery(first);
    expect(getMenus).toHaveBeenCalledTimes(3);
    await client.invalidateQueries({ queryKey: apiKeys.menus().slice(0, 2) });
    await client.fetchQuery(first);
    expect(getMenus).toHaveBeenCalledTimes(4);
  });

  it("resets pagination only for actual home filter changes", () => {
    const initial = useDiscoveryFilters.getState().home;
    useDiscoveryFilters.getState().setHomePage(3, "scope");
    useDiscoveryFilters.getState().update("home", { sort: initial.sort });
    expect(useDiscoveryFilters.getState().homePage).toBe(3);
    useDiscoveryFilters.getState().update("map", { sort: "price_asc" });
    expect(useDiscoveryFilters.getState().homePage).toBe(3);
    useDiscoveryFilters.getState().update("home", { sort: initial.sort === "price_desc" ? "dietary" : "price_desc" });
    expect(useDiscoveryFilters.getState().homePage).toBe(1);
    expect(useDiscoveryFilters.getState().homePageScope).toBe("");
    useDiscoveryFilters.setState({ home: initial });
  });

  it("treats unchanged dietary conditions as the same profile", () => {
    expect(profileSignature(["milk", "egg"], ["pork"])).toBe(profileSignature(["egg", "milk"], ["pork"]));
    expect(profileSignature(["milk"], [])).not.toBe(profileSignature(["egg"], []));
  });
});
