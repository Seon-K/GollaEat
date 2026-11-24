import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { apiKeys } from "./keys";
import { getDataProvider } from "./providers";

export const menuDetailOptions = (id: string) => queryOptions({
  queryKey: apiKeys.menu(id),
  queryFn: ({ signal }) => getDataProvider().getMenu(id, { signal }),
  staleTime: 5 * 60_000,
});

export const menuJudgementOptions = (id: string) => queryOptions({
  queryKey: apiKeys.judgement(id),
  queryFn: ({ signal }) => getDataProvider().postJudgement(id, { signal }),
  staleTime: 30_000,
});

export function prefetchMenuDetail(client: QueryClient, id: string) {
  void client.prefetchQuery(menuDetailOptions(id));
  void client.prefetchQuery(menuJudgementOptions(id));
}
