import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ReviewCard } from "./ReviewCard";

describe("review ownership presentation", () => {
  it.each([true, false])("shows the management dropdown only for own reviews (is_mine=%s)", (is_mine) => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null,
      createElement(ReviewCard, { review: { id: 4, menu_id: "menu", body: "경험", is_mine, created_at: "2026-11-24T00:00:00Z", updated_at: "2026-11-24T00:00:00Z", disclosed_conditions: [{ code: "milk", name: "우유", kind: "allergen" }] } }))));
    expect(html.includes('aria-label="리뷰 관리"')).toBe(is_mine);
    expect(html.includes('aria-haspopup="menu"')).toBe(is_mine);
    expect(html).toContain("h-6");
    expect(html).toContain("text-[11px]");
    expect(html).toContain("우유");
    client.clear();
  });
});
