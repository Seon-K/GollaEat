import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import ExplorePage from "@/pages/ExplorePage";
import MapPage from "@/pages/MapPage";
import { DiscoveryControls } from "@/components/DiscoveryControls";
import { RestaurantCard } from "@/components/RestaurantCard";
import { MenuCard } from "@/components/MenuCard";

describe("map discovery presentation", () => {
  it("preserves the original home location selector and layout without a map", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(ExplorePage))));
    expect(html).toContain("충남 아산시");
    expect(html).not.toContain("지도에서 탐색");
    expect(html).not.toContain("주변 매장 지도");
    expect(html.indexOf("충남 아산시")).toBeLessThan(html.indexOf("오늘은 어떤 메뉴가"));
    expect(html.indexOf('aria-label="메뉴명 또는 식당명 검색"')).toBeLessThan(html.indexOf("내 조건에 맞는 식당"));
    client.clear();
  });
  it("renders a full viewport map with a nonmodal restaurant sheet and automatic discovery", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(MapPage))));
    expect(html).toContain("fixed inset-y-0");
    expect(html).toContain('aria-label="식당 및 메뉴 목록"');
    expect(html).not.toContain("지도 이동 시 자동 추천");
    expect(html.indexOf('aria-label="식이조건 판정 필터"')).toBeGreaterThan(html.indexOf('aria-label="식당 및 메뉴 목록"'));
    expect(html).not.toContain("가격 전체");
    expect(html).toContain("height:38dvh");
    expect(html).not.toContain("이 지역에서 검색");
    client.clear();
  });
  it("uses branded custom controls instead of browser select elements", () => {
    const html = renderToStaticMarkup(createElement(DiscoveryControls, {
      value: { query: "", category: "all", status: "all", sort: "dietary" }, onChange: () => {}, distance: true,
    }));
    expect(html).not.toContain("<select");
    expect(html.match(/aria-haspopup="listbox"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="음식 카테고리"');
    expect(html).toContain("추천순");
    expect(html).toContain("판정 전체");
  });
  it("opens restaurant menus first and lets menu cards link to menu detail", () => {
    const restaurant = renderToStaticMarkup(createElement(RestaurantCard, {
      restaurant: { id: "store", name: "식당", lat: 36, lng: 127, distanceKm: null, address: null, phone: null,
        map: { kakaoMapUrl: null, kakaoDirectionsUrl: null, walkingDirectionsUrl: null, mapUrl: null } },
      selected: false, onSelect: () => {}, showDistance: false,
    }));
    expect(restaurant).toContain('aria-label="식당 메뉴 보기"');
    expect(restaurant).not.toContain("href=");
    const menu = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(MenuCard, {
      item: { id: "menu-123", name: "두부 비빔밥", restaurantName: "식당", priceAmount: 9000, distanceKm: null, status: "check", saved: false },
    })));
    expect(menu).toContain('href="/menu/menu-123"');
  });
});
