// @vitest-environment jsdom
import { createElement as h } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";
import { ProfileCacheSync } from "../AppProviders";
import { apiKeys } from "@/lib/api/keys";
import { useProfileStore } from "@/store/profileStore";

afterEach(() => cleanup());
it("refreshes saved verdicts after removing the last dietary condition", async () => {
  useProfileStore.setState({ allergens: ["milk"], restrictions: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(apiKeys.favorites(), "mismatch");
  function SavedVerdict() {
    const query = useQuery({ queryKey: apiKeys.favorites(), queryFn: async () => "match" });
    return h("p", null, query.data);
  }
  render(h(QueryClientProvider, { client }, h(ProfileCacheSync), h(SavedVerdict)));
  expect(screen.getByText("mismatch")).toBeTruthy();
  act(() => useProfileStore.setState({ allergens: [], restrictions: [] }));
  expect(await screen.findByText("match")).toBeTruthy();
  client.clear();
});
