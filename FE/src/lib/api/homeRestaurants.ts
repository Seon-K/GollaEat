import { queryOptions } from "@tanstack/react-query";
import { apiKeys } from "./keys";
import { getDataProvider } from "./providers";
import type { RestaurantListParams } from "./providers/types";
const HOME_RESTAURANT_PAGE_SIZE = 10;

export function homeRestaurantsOptions(params: RestaurantListParams & { page: number }, profile: string) {
  const request = { ...params, view: "card" as const, limit: HOME_RESTAURANT_PAGE_SIZE };
  return queryOptions({
    queryKey: apiKeys.restaurants({ ...request, profile, view: "home-page" }),
    queryFn: () => getDataProvider().getRestaurants(request),
    staleTime: Infinity, gcTime: Infinity, refetchOnMount: true,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
}
