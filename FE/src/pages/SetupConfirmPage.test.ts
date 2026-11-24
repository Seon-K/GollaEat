// @vitest-environment jsdom
import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import SetupConfirmPage from "./SetupConfirmPage";
import { apiKeys } from "@/lib/api/keys";
import { useProfileStore } from "@/store/profileStore";

const { putProfile } = vi.hoisted(() => ({ putProfile: vi.fn() }));
vi.mock("@/lib/api/providers", () => ({ getDataProvider: () => ({ putProfile }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("invalidates earlier personalized reads only after profile saving succeeds", async () => {
  useProfileStore.setState({ allergens: [], restrictions: [] });
  let saved!: (value: { criteria: string[]; setup_completed: boolean }) => void;
  putProfile.mockReturnValue(new Promise((resolve) => { saved = resolve; }));
  const client = new QueryClient();
  client.setQueryData(apiKeys.favorites(), []);
  client.setQueryData(apiKeys.judgement("menu"), { status: "mismatch" });
  render(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(SetupConfirmPage))));
  fireEvent.click(screen.getByRole("button", { name: "설정 저장하고 메뉴 탐색하기" }));
  expect(client.getQueryState(apiKeys.favorites())?.isInvalidated).toBe(false);
  saved({ criteria: [], setup_completed: true });
  await waitFor(() => expect(client.getQueryState(apiKeys.favorites())?.isInvalidated).toBe(true));
  expect(client.getQueryState(apiKeys.judgement("menu"))?.isInvalidated).toBe(true);
  expect(putProfile).toHaveBeenCalledWith([]);
  client.clear();
});
