import { queryOptions } from "@tanstack/react-query";
import { apiKeys } from "./keys";
import { getDataProvider } from "./providers";
import type { MenuListParams } from "./providers/types";

export const HOME_PAGE_SIZE = 20;

export function profileSignature(allergens: readonly string[], restrictions: readonly string[]) {
  return JSON.stringify([[...allergens].sort(), [...restrictions].sort()]);
}

export function homeMenusOptions(params: MenuListParams & { page: number }, profile: string) {
  const request = { ...params, limit: HOME_PAGE_SIZE };
  return queryOptions({
    queryKey: apiKeys.menus({ ...request, profile, view: "home-page" }),
    queryFn: () => getDataProvider().getMenus(request),
    // Retain visited pages for this app session. Explicit profile/session
    // invalidation still takes precedence over freshness.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
