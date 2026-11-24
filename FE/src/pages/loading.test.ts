// @vitest-environment jsdom
import { useDiscoveryFilters } from "@/hooks/useDiscovery";
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
import { useProfileStore } from "@/store/profileStore";
import { apiKeys } from "@/lib/api/keys";

const mocks = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  getBootstrapProfile: vi.fn(),
  provider: { getRestaurants: vi.fn(), getMenus: vi.fn(), getMenu: vi.fn(), postJudgement: vi.fn(), getReviews: vi.fn(), getProfile: vi.fn() },
  geo: { position: null as null | { lat: number; lng: number }, status: "idle", request: vi.fn() },
}));
vi.mock("@/lib/api/providers", () => ({ getDataMode: () => "api", getDataProvider: () => mocks.provider }));
vi.mock("@/lib/api/client", () => ({ ensureSession: mocks.ensureSession, getBootstrapProfile: mocks.getBootstrapProfile, onSessionIdentityChange: () => () => {} }));
vi.mock("@/hooks/useFavoriteToggle", () => ({ useFavorites: () => ({ isSaved: () => false, isSaving: () => false, toggling: false, toggleSave: vi.fn() }) }));
vi.mock("@/components/NearbyMap", () => ({ NearbyMap: () => null }));
vi.mock("@/components/StoreMap", () => ({ StoreMap: () => null }));
vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => mocks.geo, getCachedLocation: () => mocks.geo.position }));

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
  useProfileStore.setState({ allergens: [], restrictions: [], completed: false });
  useDiscoveryFilters.setState({ home: { query: "", category: "all", sort: "dietary", status: "all" }, homePage: 1, homePageScope: "" });
  mocks.provider.getRestaurants.mockReset().mockResolvedValue({ items: [], pagination: { ...pagination, limit: 10 } });
  mocks.getBootstrapProfile.mockReset().mockImplementation(async () => { await mocks.ensureSession(); return null; });
  mocks.provider.getMenus.mockReset().mockResolvedValue({ items: [], pagination });
  mocks.provider.getReviews.mockReset().mockResolvedValue([]);
  mocks.provider.getMenu.mockReset().mockResolvedValue(detail);
  mocks.provider.postJudgement.mockReset().mockResolvedValue(judgement);
  mocks.ensureSession.mockReset().mockResolvedValue(undefined);
  mocks.provider.getProfile.mockReset().mockResolvedValue({ criteria: [], setup_completed: false });
  mocks.geo = { position: null, status: "idle", request: vi.fn() };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("restaurant home integration", () => {
  const restaurant = { id: 'r1', name: '기존 식당', address: '아산시', phone: null, lat: 36, lng: 127, distanceKm: 1,
    map: { kakaoMapUrl: null, kakaoDirectionsUrl: null, walkingDirectionsUrl: null, mapUrl: null } };
  it("keeps loaded cards during a background refresh", async () => {
    const pending = deferred<{ items: typeof restaurant[]; pagination: typeof pagination }>();
    mocks.provider.getRestaurants.mockResolvedValueOnce({ items: [restaurant], pagination }).mockReturnValueOnce(pending.promise);
    const view = mount(h(ExplorePage));
    await screen.findByText('기존 식당');
    void view.client.invalidateQueries({ queryKey: ['gollaeat', 'restaurants'] });
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2));
    expect(screen.getByText('기존 식당')).toBeTruthy();
    expect(screen.queryByRole('status', { name: '식당 목록 로딩 중' })).toBeNull();
    await act(async () => pending.resolve({ items: [restaurant], pagination }));
  });
  it('shows skeletons instead of previous cards while fetching another page', async () => {
    const pending = deferred<{ items: typeof restaurant[]; pagination: typeof pagination }>();
    mocks.provider.getRestaurants.mockResolvedValueOnce({ items: [restaurant], pagination: { ...pagination, limit: 10, total: 20, totalPages: 2, nextPage: 2 } }).mockReturnValueOnce(pending.promise);
    mount(h(ExplorePage));
    await screen.findByText('기존 식당');
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    scroll.mockRestore();
    await screen.findByRole('status', { name: '식당 목록 로딩 중' });
    expect(screen.queryByText('기존 식당')).toBeNull();
    await act(async () => pending.resolve({ items: [{ ...restaurant, id: 'r2', name: '다음 식당' }], pagination: { ...pagination, page: 2 } }));
    expect(await screen.findByText('다음 식당')).toBeTruthy();
  });
  it("keeps cards during GPS updates but hides their old distance", async () => {
    mocks.provider.getRestaurants.mockResolvedValueOnce({ items: [restaurant], pagination }).mockReturnValueOnce(new Promise(() => {}));
    const view = mount(h(ExplorePage));
    await screen.findByText('기존 식당');
    mocks.geo.position = { lat: 36.8, lng: 127.1 };
    view.rerenderPage();
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2));
    expect(screen.getByText('기존 식당')).toBeTruthy();
    expect(screen.queryByText('내 위치에서 1.0km')).toBeNull();
    expect((screen.getByRole('button', { name: '기존 식당 메뉴 보기' }).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });
  it("does not reuse cards across profile changes", async () => {
    mocks.provider.getRestaurants.mockResolvedValueOnce({ items: [restaurant], pagination }).mockReturnValue(new Promise(() => {}));
    mount(h(ExplorePage));
    await screen.findByText('기존 식당');
    await act(async () => useProfileStore.setState({ allergens: ['milk'] }));
    await screen.findByRole('status', { name: '식당 목록 로딩 중' });
    expect(screen.queryByText('기존 식당')).toBeNull();
  });
  it("does not show old cards while a different category is loading", async () => {
    mocks.provider.getRestaurants.mockResolvedValueOnce({ items: [restaurant], pagination }).mockReturnValue(new Promise(() => {}));
    mount(h(ExplorePage));
    await screen.findByText('기존 식당');
    fireEvent.click(screen.getByRole('button', { name: '음식 카테고리' }));
    fireEvent.click(screen.getByRole('option', { name: '한식' }));
    await screen.findByRole('status', { name: '식당 목록 로딩 중' });
    expect(screen.queryByText('기존 식당')).toBeNull();
  });
  it("requests ten restaurants with server filters and does not wait for GPS", async () => {
    mocks.geo.status = "loading";
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1));
    expect(mocks.provider.getRestaurants).toHaveBeenLastCalledWith(expect.objectContaining({ region: "아산시", limit: 10, personalize: true, page: 1, view: "card" }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("debounces search and reuses the cached unfiltered page", async () => {
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "김밥" } });
    expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2));
    expect(mocks.provider.getRestaurants.mock.calls[1][0].q).toBe("김밥");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2);
  });
  it("uses actual GPS coordinates and cancels the previous area query", async () => {
    mocks.provider.getRestaurants.mockReturnValueOnce(new Promise(() => {}));
    const view = mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1));
    const signal = mocks.provider.getRestaurants.mock.calls[0][1].signal as AbortSignal;
    mocks.geo.position = { lat: 36.8, lng: 127.1 };
    view.rerenderPage();
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2));
    expect(signal.aborted).toBe(true);
    expect(mocks.provider.getRestaurants.mock.calls[1][0]).toMatchObject({ lat: 36.8, lng: 127.1 });
    expect(screen.getByRole("button", { name: "현재 위치" })).toBeTruthy();
  });
  it("allows returning from GPS to the cached Asan origin", async () => {
    mocks.geo.position = { lat: 36.8, lng: 127.1 };
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "현재 위치" }));
    fireEvent.click(screen.getByRole("button", { name: "충남 아산시" }));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "충남 아산시" })).toBeTruthy();
    expect(mocks.provider.getRestaurants.mock.calls[1][0].lat).not.toBe(36.8);
  });
  it("uses server category and price ordering while keeping ten-item pagination", async () => {
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "음식 카테고리" }));
    fireEvent.click(screen.getByRole("option", { name: "한식" }));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "정렬" }));
    fireEvent.click(screen.getByRole("option", { name: "낮은 가격순" }));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(3));
    expect(mocks.provider.getRestaurants.mock.calls[2][0]).toMatchObject({ category: "한식", sort: "price_asc", page: 1, limit: 10 });
  });
  it("continues using Asan when GPS is denied or unavailable", async () => {
    mocks.geo.status = "denied";
    mount(h(ExplorePage));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "충남 아산시" })).toBeTruthy();
    expect(mocks.provider.getRestaurants.mock.calls[0][0]).toMatchObject({ region: "아산시", limit: 10 });
  });
  it("shows a skeleton during loading and supports error retry", async () => {
    mocks.provider.getRestaurants.mockRejectedValueOnce(new Error("조회 실패"));
    mount(h(ExplorePage));
    await screen.findByText("조회 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("조회 실패")).toBeNull());
  });
});

describe("detail request lifecycle", () => {
  it("shows menu data while only the judgement panel remains a skeleton", async () => {
    const pending = deferred<JudgementUi>();
    mocks.provider.postJudgement.mockReturnValue(pending.promise);
    mount(h(MenuDetailPage), "/menu/m1");
    await waitFor(() => expect(mocks.provider.postJudgement).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: detail.name })).toBeTruthy();
    expect(screen.getByRole("status", { name: "식이조건 판정 로딩 중" })).toBeTruthy();
    await act(async () => pending.resolve(judgement));
    expect(await screen.findByRole("heading", { name: detail.name })).toBeTruthy();
  });
  it("retries judgement without fetching the menu again", async () => {
    mocks.provider.postJudgement.mockRejectedValueOnce(new Error("판정 연결 실패")).mockResolvedValueOnce(judgement);
    mount(h(MenuDetailPage), "/menu/m1");
    await screen.findByText("판정 연결 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("heading", { name: detail.name });
    expect(mocks.provider.getMenu).toHaveBeenCalledTimes(1);
    expect(mocks.provider.postJudgement).toHaveBeenCalledTimes(2);
  });
});

describe("safe introduction loading", () => {
  it("prefetches only after server profile hydration and reuses the home cache", async () => {
    const pending = deferred<{ criteria: string[]; setup_completed: boolean }>();
    mocks.provider.getProfile.mockReturnValue(pending.promise);
    const view = mount(h(SplashPage), '/', true);
    expect(mocks.provider.getRestaurants).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ criteria: [], setup_completed: true }));
    await waitFor(() => expect(mocks.provider.getRestaurants).toHaveBeenCalledTimes(1));
    const request = mocks.provider.getRestaurants.mock.calls[0][0];
    expect(request).toMatchObject({ view: 'card', limit: 10, page: 1, personalize: true });
    expect(view.client.getQueryData(apiKeys.restaurants({ ...request, profile: JSON.stringify([[], []]), view: 'home-page' }))).toBeTruthy();
  });
  it("renders the introduction immediately but blocks navigation until hydration; strict mode deduplicates profile", async () => {
    const profile = deferred<{ criteria: string[]; setup_completed: boolean }>();
    mocks.provider.getProfile.mockReturnValue(profile.promise);
    mount(h(SplashPage), "/", true);
    expect(screen.getByRole("button", { name: "연결 중…" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(mocks.provider.getProfile).toHaveBeenCalledTimes(1));
    await act(async () => profile.resolve({ criteria: [], setup_completed: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: "시작하기" }).hasAttribute("disabled")).toBe(false));
    expect(mocks.provider.getRestaurants).not.toHaveBeenCalled();
  });

  it("keeps identical restaurant placeholders before and after session hydration", async () => {
    const profile = deferred<{ criteria: string[]; setup_completed: boolean }>();
    mocks.provider.getProfile.mockReturnValue(profile.promise);
    mocks.provider.getRestaurants.mockReturnValue(new Promise(() => {}));
    mount(h(ExplorePage), "/explore", true);
    const initial = screen.getByRole("status", { name: "식당 목록 로딩 중" }).innerHTML;
    expect(mocks.provider.getRestaurants).not.toHaveBeenCalled();
    await act(async () => profile.resolve({ criteria: [], setup_completed: false }));
    // StrictMode may cancel the first mount's request; only one stays active.
    await waitFor(() => expect(mocks.provider.getRestaurants.mock.calls.filter(
      ([, options]) => !options.signal.aborted)).toHaveLength(1));
    expect(screen.getByRole("status", { name: "식당 목록 로딩 중" }).innerHTML).toBe(initial);
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
