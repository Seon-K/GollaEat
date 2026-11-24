import { queryOptions } from "@tanstack/react-query";
import { apiKeys } from "./keys";
import { getDataProvider } from "./providers";
import type { RestaurantListParams } from "./providers/types";
import { filterParams, type DiscoveryFilters } from "@/hooks/useDiscovery";
import type { GeoPoint } from "@/hooks/useGeolocation";
const HOME_RESTAURANT_PAGE_SIZE = 10;

export function homeRestaurantParams(filters: DiscoveryFilters, query: string, origin: GeoPoint) {
  return { ...filterParams(filters, query), region: '아산시', personalize: true, lat: origin.lat, lng: origin.lng };
}

/** Keep cards only while moving or paging within the same profile/filter scope. */
export function restaurantDisplayScope(params: RestaurantListParams, profile: string) {
  const { lat: _lat, lng: _lng, page: _page, ...filters } = params;
  return JSON.stringify({ ...filters, profile });
}

export function homeRestaurantsOptions(params: RestaurantListParams & { page: number }, profile: string) {
  const request = { ...params, view: "card" as const, limit: HOME_RESTAURANT_PAGE_SIZE };
  return queryOptions({
    queryKey: apiKeys.restaurants({ ...request, profile, view: "home-page" }),
    queryFn: ({ signal }) => getDataProvider().getRestaurants(request, { signal }),
    staleTime: Infinity, gcTime: Infinity, refetchOnMount: true,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
}
