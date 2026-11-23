// @vitest-environment jsdom
import { createElement as h, cloneElement, StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuListItemUi, MenuDetailUi, JudgementUi } from "@/lib/api/adapters";
import ExplorePage from "@/pages/ExplorePage";
import MenuDetailPage from "@/pages/MenuDetailPage";
import SplashPage from "@/pages/SplashPage";
import { SessionGate } from "@/components/SessionGate";

const mocks = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  provider: { getMenus: vi.fn(), getMenu: vi.fn(), postJudgement: vi.fn(), getReviews: vi.fn(), getProfile: vi.fn() },
  geo: { location: { lat: 36.78, lng: 127.05, label: "현재 위치", isGps: true },
    status: "ready" as "ready" | "pending" | "denied" | "unavailable", refresh: vi.fn() },
}));
vi.mock("@/lib/api/providers", () => ({ getDataMode: () => "api", getDataProvider: () => mocks.provider }));
vi.mock("@/lib/api/client", () => ({ ensureSession: mocks.ensureSession }));
vi.mock("@/hooks/useFavoriteToggle", () => ({ useFavorites: () => ({ isSaved: () => false, toggling: false, toggleSave: vi.fn() }) }));
vi.mock("@/components/NearbyMap", () => ({ NearbyMap: () => null }));
vi.mock("@/components/StoreMap", () => ({ StoreMap: () => null }));
vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => mocks.geo }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const pagination = { page: 1, limit: 40, count: 0, total: 0, totalPages: 0, nextPage: null, previousPage: null };
const item = (name: string, priceAmount = 1000, category = "한식"): MenuListItemUi => ({
  id: name, name, restaurantId: "r1", restaurantName: "테스트 매장", priceAmount, category,
  currency: "KRW", distanceKm: 0, lat: null, lng: null, saved: false, judgement: null,
});
const detail: MenuDetailUi = { ...item("메뉴 기본정보"), phone: null, allergenInformation: null, components: [], optionGroups: [] };
const judgement: JudgementUi = { componentId: detail.id, status: "check", reasons: [], problemIngredients: [], unknownItems: [], unknownMessages: [], sources: [], preferenceScore: 0, sortKey: [] };

function mount(component: ReturnType<typeof h>, path = "/explore", gated = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } } });
  const tree = () => {
    const route = h(Routes, null, h(Route, { path: path.startsWith("/menu/") ? "/menu/:id" : "*", element: cloneElement(component) }));
    return h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] },
      gated ? h(StrictMode, null, h(SessionGate, null, route)) : route));
  };
  const view = render(tree());
  return { ...view, client, rerenderPage: () => view.rerender(tree()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.provider.getMenus.mockReset().mockResolvedValue({ items: [], pagination });
  mocks.provider.getReviews.mockReset().mockResolvedValue([]);
  mocks.provider.getMenu.mockReset().mockResolvedValue(detail);
  mocks.provider.postJudgement.mockReset().mockResolvedValue(judgement);
  mocks.ensureSession.mockReset().mockResolvedValue(undefined);
  mocks.provider.getProfile.mockReset().mockResolvedValue({ criteria: [], setup_completed: false });
  mocks.geo = { location: { lat: 36.78, lng: 127.05, label: "현재 위치", isGps: true }, status: "ready", refresh: vi.fn() };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("search request lifecycle", () => {
  it("debounces typing for 300ms and clearing retains existing list parameters", async () => {
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    const input = screen.getByRole("textbox", { name: "메뉴명 또는 식당명 검색" });
    fireEvent.change(input, { target: { value: "김" } });
    await act(() => vi.advanceTimersByTimeAsync(200));
    fireEvent.change(input, { target: { value: "김밥" } });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mocks.provider.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ q: "김밥", limit: 40, personalize: true }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    fireEvent.change(input, { target: { value: "" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    // Clearing reuses the fresh unfiltered cache instead of issuing a duplicate.
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(2);
    expect(mocks.provider.getMenus.mock.calls[0][0]).toMatchObject({ q: undefined, limit: 40, personalize: true });
  });

  it("cancels the previous query and ignores its late result", async () => {
    const old = deferred<{ items: MenuListItemUi[]; pagination: typeof pagination }>();
    mocks.provider.getMenus.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [item("새 메뉴")], pagination });
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1));
    const signal = mocks.provider.getMenus.mock.calls[0][1].signal as AbortSignal;
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "새" } });
    expect(signal.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("새 메뉴")).toBeTruthy();
    await act(async () => { old.resolve({ items: [item("옛 메뉴")], pagination }); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByText("옛 메뉴")).toBeNull();
    expect(screen.getByText("새 메뉴")).toBeTruthy();
  });

  it("does not request unfinished Korean IME text", async () => {
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    const input = screen.getByRole("textbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "김밥" } });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1);
    fireEvent.compositionEnd(input);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(mocks.provider.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ q: "김밥" }), expect.anything());
  });

  it("retains category filtering and price ordering", async () => {
    mocks.provider.getMenus.mockResolvedValue({ items: [item("비싼 한식", 2000), item("싼 한식", 1000), item("양식", 500, "양식")], pagination });
    mount(h(ExplorePage));
    await screen.findByText("비싼 한식");
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    fireEvent.click(screen.getByRole("button", { name: "한식" }));
    expect(screen.queryByText("양식")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "추천순" }));
    fireEvent.click(screen.getByRole("button", { name: "낮은 가격순" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual(["싼 한식", "비싼 한식"]);
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1);
  });
});

describe("GPS and search integration", () => {
  it("waits for both location readiness and the debounced search", async () => {
    mocks.geo.status = "pending";
    const view = mount(h(ExplorePage));
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "김밥" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(mocks.provider.getMenus).not.toHaveBeenCalled();
    mocks.geo = { ...mocks.geo, status: "ready", location: { ...mocks.geo.location, lat: 37, lng: 127 } };
    view.rerenderPage();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1);
    expect(mocks.provider.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ q: "김밥", lat: 37, lng: 127 }), expect.anything());
  });

  it("cancels GPS A and ignores its late result after GPS B becomes active", async () => {
    const previous = deferred<{ items: MenuListItemUi[]; pagination: typeof pagination }>();
    mocks.provider.getMenus.mockReturnValueOnce(previous.promise).mockResolvedValueOnce({ items: [item("GPS B 결과")], pagination });
    const view = mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1));
    const signal = mocks.provider.getMenus.mock.calls[0][1].signal as AbortSignal;
    mocks.geo = { ...mocks.geo, location: { ...mocks.geo.location, lat: 37.5, lng: 127.2 } };
    view.rerenderPage();
    expect(signal.aborted).toBe(true);
    await screen.findByText("GPS B 결과");
    expect(mocks.provider.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 37.5, lng: 127.2 }), expect.anything());
    await act(async () => previous.resolve({ items: [item("GPS A 늦은 결과")], pagination }));
    expect(screen.queryByText("GPS A 늦은 결과")).toBeNull();
  });

  it("keeps requests paused when GPS changes during Korean composition", async () => {
    const previous = deferred<{ items: MenuListItemUi[]; pagination: typeof pagination }>();
    mocks.provider.getMenus.mockReturnValueOnce(previous.promise).mockResolvedValueOnce({ items: [], pagination });
    const view = mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1));
    const signal = mocks.provider.getMenus.mock.calls[0][1].signal as AbortSignal;
    vi.useFakeTimers();
    const input = screen.getByRole("textbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "김밥" } });
    mocks.geo = { ...mocks.geo, location: { ...mocks.geo.location, lat: 37.2, lng: 127.3 } };
    view.rerenderPage();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(signal.aborted).toBe(true);
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1);
    fireEvent.compositionEnd(input);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(2);
    expect(mocks.provider.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ q: "김밥", lat: 37.2, lng: 127.3 }), expect.anything());
    await act(async () => previous.resolve({ items: [], pagination }));
  });

  it("cancels in-flight search while location is being refreshed", async () => {
    const previous = deferred<{ items: MenuListItemUi[]; pagination: typeof pagination }>();
    mocks.provider.getMenus.mockReturnValueOnce(previous.promise);
    const view = mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1));
    const signal = mocks.provider.getMenus.mock.calls[0][1].signal as AbortSignal;
    mocks.geo = { ...mocks.geo, status: "pending" };
    view.rerenderPage();
    expect(signal.aborted).toBe(true);
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1);
    expect(screen.getByText("위치 확인 중…")).toBeTruthy();
    await act(async () => previous.resolve({ items: [], pagination }));
  });

  it("handles fast input, deletion and reverting to the same key without stale results", async () => {
    const previous = deferred<{ items: MenuListItemUi[]; pagination: typeof pagination }>();
    mocks.provider.getMenus.mockReturnValueOnce(previous.promise).mockResolvedValueOnce({ items: [item("최신 전체 목록")], pagination });
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getMenus).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "김" } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.change(input, { target: { value: "김밥" } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.change(input, { target: { value: "" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(mocks.provider.getMenus).toHaveBeenCalledTimes(2);
    expect(mocks.provider.getMenus.mock.calls.every(([params]) => params.q === undefined)).toBe(true);
    expect(screen.getByText("최신 전체 목록")).toBeTruthy();
    await act(async () => { previous.resolve({ items: [item("취소된 전체 목록")], pagination }); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByText("취소된 전체 목록")).toBeNull();
  });

  it("preserves GPS-based fallback distance ordering and manual location selection", async () => {
    const far = { ...item("먼 매장"), distanceKm: null, lat: 37.5, lng: 127.5 };
    const near = { ...item("가까운 매장"), distanceKm: null, lat: 36.7801, lng: 127.05 };
    mocks.provider.getMenus.mockResolvedValue({ items: [far, near], pagination });
    mount(h(ExplorePage));
    await screen.findByText("가까운 매장");
    expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual(["가까운 매장", "먼 매장"]);
    fireEvent.click(screen.getByRole("button", { name: "현재 위치" }));
    fireEvent.click(screen.getByRole("button", { name: "충남 아산시" }));
    expect(screen.getByRole("button", { name: "충남 아산시" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "현재 위치" })).toBeNull();
  });
});

describe("independent detail loading", () => {
  it("shows basic menu information while judgement is pending", async () => {
    const pending = deferred<JudgementUi>();
    mocks.provider.postJudgement.mockReturnValue(pending.promise);
    mount(h(MenuDetailPage), "/menu/m1");
    expect(await screen.findByRole("heading", { name: detail.name })).toBeTruthy();
    expect(screen.getByText("식이 조건 확인 중…")).toBeTruthy();
    expect(screen.queryByText("확인된 제한 성분 없음")).toBeNull();
    await act(async () => pending.resolve(judgement));
    await waitFor(() => expect(screen.queryByText("식이 조건 확인 중…")).toBeNull());
  });

  it("keeps basic information and allows retry after judgement fails", async () => {
    mocks.provider.postJudgement.mockRejectedValueOnce(new Error("판정 연결 실패")).mockResolvedValueOnce(judgement);
    mount(h(MenuDetailPage), "/menu/m1");
    await screen.findByText("판정 연결 실패");
    expect(screen.getByRole("heading", { name: detail.name })).toBeTruthy();
    expect(screen.queryByText("확인된 제한 성분 없음")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(mocks.provider.postJudgement).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("판정 연결 실패")).toBeNull());
  });
});

describe("safe introduction loading", () => {
  it("renders the introduction immediately but blocks navigation until hydration; strict mode deduplicates profile", async () => {
    const profile = deferred<{ criteria: string[]; setup_completed: boolean }>();
    mocks.provider.getProfile.mockReturnValue(profile.promise);
    mount(h(SplashPage), "/", true);
    expect(screen.getByRole("button", { name: "연결 중…" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(mocks.provider.getProfile).toHaveBeenCalledTimes(1));
    await act(async () => profile.resolve({ criteria: [], setup_completed: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: "시작하기" }).hasAttribute("disabled")).toBe(false));
  });

  it("does not render personalized pages before server profile is available", async () => {
    const profile = deferred<{ criteria: string[]; setup_completed: boolean }>();
    mocks.provider.getProfile.mockReturnValue(profile.promise);
    mount(h("div", null, "개인화 화면"), "/explore", true);
    expect(screen.queryByText("개인화 화면")).toBeNull();
    await act(async () => profile.resolve({ criteria: [], setup_completed: false }));
    expect(await screen.findByText("개인화 화면")).toBeTruthy();
  });

  it("keeps introduction visible on initialization error and permits retry", async () => {
    mocks.ensureSession.mockRejectedValue(new Error("연결 오류"));
    mount(h(SplashPage), "/", true);
    await screen.findByText("연결 오류");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    mocks.ensureSession.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "시작하기" }).hasAttribute("disabled")).toBe(false));
  });
});
