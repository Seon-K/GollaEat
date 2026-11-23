import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { apiKeys } from "@/lib/api/keys";
import MenuReportPage from "./MenuReportPage";
import ShowStaffPage from "./ShowStaffPage";

describe("information report entry points", () => {
  it.each(["error", "contribution"] as const)("uses real menu query data and distinguishes %s copy", (mode) => {
    const client = new QueryClient();
    client.setQueryData(apiKeys.menu("real-menu"), { id: "real-menu", name: "실제 메뉴", restaurantName: "실제 식당", restaurantId: "store" });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, { initialEntries: ["/menu/real-menu/report"] }, createElement(Routes, null,
        createElement(Route, { path: "/menu/:id/report", element: createElement(MenuReportPage, { mode }) })))));
    expect(html).toContain("실제 메뉴");
    expect(html).toContain("실제 식당");
    expect(html).toContain(mode === "error" ? "정보 오류" : "정보 제보");
    expect(html).toContain(mode === "error" ? "오류 신고하기" : "정보 제보하기");
    expect(html).toContain('maxLength="5000"');
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).not.toContain("접수되었습니다");
    client.clear();
  });
  it("places a contribution link at the bottom of the staff screen with menu context", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/show-staff?menuId=real-menu"] }, createElement(ShowStaffPage)));
    expect(html).toContain('href="/menu/real-menu/contribute?from=staff"');
    expect(html.indexOf("매장에서 확인한 정보 제보하기")).toBeGreaterThan(html.indexOf("확인해 주셔서 감사합니다"));
  });
});
