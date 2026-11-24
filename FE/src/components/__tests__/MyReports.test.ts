// @vitest-environment jsdom
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MyReports } from "../MyReports";
import { getDataProvider } from "@/lib/api/providers";
import type { DataProvider } from "@/lib/api/providers/types";

vi.mock("@/lib/api/providers", () => ({ getDataProvider: vi.fn() }));
const getMyReports = vi.fn();
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount(active = true) {
  vi.mocked(getDataProvider).mockReturnValue({ getMyReports } as unknown as DataProvider);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(MyReports, { active }))));
  return client;
}
const pagination = { page: 1, limit: 20, total: 1, count: 1, totalPages: 1, nextPage: null, previousPage: null };
describe("my reports", () => {
  it("does not request reports from an inactive tab", () => {
    mount(false);
    expect(getMyReports).not.toHaveBeenCalled();
  });
  it("shows report content, review status and a menu link without unsupported edit actions", async () => {
    getMyReports.mockResolvedValue({ items: [{ report_id: 7, category: "ingredients_allergens", content: "우유 포함 확인", status: "reviewing", created_at: "2026-11-24T00:00:00Z", reviewed_at: null, menu_id: "menu-7" }], pagination });
    mount();
    expect(await screen.findByText("우유 포함 확인")).toBeTruthy();
    expect(screen.getByText("검토 중")).toBeTruthy();
    expect(screen.getByRole("link", { name: "대상 메뉴 보기" }).getAttribute("href")).toBe("/menu/menu-7");
    expect(screen.queryByRole("button", { name: "수정" })).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
  });
  it("shows the empty state", async () => {
    getMyReports.mockResolvedValue({ items: [], pagination: { ...pagination, total: 0, totalPages: 0 } });
    mount();
    expect(await screen.findByText("작성한 제보가 없습니다")).toBeTruthy();
  });
  it("lets the user retry a failed request", async () => {
    getMyReports.mockRejectedValueOnce(new Error("조회 실패")).mockResolvedValue({ items: [], pagination: { ...pagination, total: 0, totalPages: 0 } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByText("작성한 제보가 없습니다")).toBeTruthy());
  });
});
