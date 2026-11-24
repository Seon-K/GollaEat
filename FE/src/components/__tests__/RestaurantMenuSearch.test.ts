// @vitest-environment jsdom
import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RestaurantMenuList } from "../RestaurantMenuList";
import type { RestaurantUi } from "@/lib/api/adapters";
import type { DiscoveryFilters } from "@/hooks/useDiscovery";

const mocks = vi.hoisted(() => ({ getMenus: vi.fn() }));
vi.mock("@/lib/api/providers", () => ({ getDataProvider: () => mocks }));
vi.mock("@/hooks/useFavoriteToggle", () => ({ useFavorites: () => ({
  isSaved: () => false, isSaving: () => false, toggleSave: vi.fn(), saveError: null,
}) }));
const store: RestaurantUi = { id: "store", name: "식당", address: "아산시", phone: null, lat: 36, lng: 127, distanceKm: null,
  map: { kakaoMapUrl: null, kakaoDirectionsUrl: null, walkingDirectionsUrl: null, mapUrl: null } };
const filters: DiscoveryFilters = { query: "  김밥  ", category: "korean", status: "check", sort: "price_asc" };
const item = (id: string, name: string) => ({ id, name, restaurantId: "store", restaurantName: "식당", priceAmount: 1000,
  category: "한식", distanceKm: null, lat: null, lng: null, saved: false, judgement: null });
function page(index: number) {
  return { items: index === 1 ? [item("exact", "김밥"), item("partial", "야채김밥")] : [item("rest", "라면")],
    pagination: { page: index, limit: 20, count: index === 1 ? 2 : 1, total: 3, totalPages: 2,
      nextPage: index === 1 ? 2 : null, previousPage: index === 2 ? 1 : null } };
}
const clients: QueryClient[] = [];
function mount(initial = filters) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = (value: DiscoveryFilters) => h(QueryClientProvider, { client }, h(MemoryRouter, null,
    h(RestaurantMenuList, { restaurant: store, filters: value, origin: { lat: 36, lng: 127 } })));
  const view = render(tree(initial));
  return (value: DiscoveryFilters) => view.rerender(tree(value));
}
beforeEach(() => { mocks.getMenus.mockReset().mockImplementation(({ page: index }: { page: number }) => Promise.resolve(page(index))); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

it("passes search as ranking only and preserves dietary/category filters on every page", async () => {
  mount();
  await screen.findByText("야채김밥");
  expect(mocks.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({
    menu_query: "김밥", q: undefined, restaurant_id: "store", category: "한식", judgement_status: "needs_check", sort: "price_asc", page: 1,
  }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  fireEvent.click(screen.getByRole("button", { name: "메뉴 더 보기" }));
  await screen.findByText("라면");
  expect(screen.getByText("김밥")).toBeTruthy();
  expect(mocks.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ menu_query: "김밥", page: 2, judgement_status: "needs_check" }), expect.anything());
});

it("changes query cache and resets pagination when the search term changes", async () => {
  const rerender = mount();
  await screen.findByText("김밥");
  fireEvent.click(screen.getByRole("button", { name: "메뉴 더 보기" }));
  await screen.findByText("라면");
  rerender({ ...filters, query: "우동" });
  await waitFor(() => expect(mocks.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ menu_query: "우동", page: 1 }), expect.anything()));
});

it("leaves the selected sort unchanged when there is no query", async () => {
  mount({ ...filters, query: "  ", sort: "dietary" });
  await screen.findByText("김밥");
  expect(mocks.getMenus).toHaveBeenLastCalledWith(expect.objectContaining({ menu_query: undefined, q: undefined, sort: "dietary" }), expect.anything());
});
