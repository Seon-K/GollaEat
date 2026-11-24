import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchMenuDetail } from "@/lib/api/menuDetailQueries";
import { ArrowLeft } from "lucide-react";
import type { RestaurantUi } from "@/lib/api/adapters";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { profileSignature } from "@/lib/api/homeMenus";
import { useProfileStore } from "@/store/profileStore";
import { filterParams, type DiscoveryFilters } from "@/hooks/useDiscovery";
import type { GeoPoint } from "@/hooks/useGeolocation";
import { useFavorites } from "@/hooks/useFavoriteToggle";
import { ApiErrorPanel } from "./ApiState";
import { DiscoverySkeleton } from "./DiscoverySkeleton";
import { MenuCard } from "./MenuCard";
import { Toast } from "./Toast";

/** Shared by the home restaurant sheet and map restaurant selection. */
export function RestaurantMenuList({ restaurant, filters, origin, showDistance = false, onBack }: {
  restaurant: RestaurantUi; filters: DiscoveryFilters; origin: GeoPoint;
  showDistance?: boolean; onBack?: () => void;
}) {
  const allergens = useProfileStore((s) => s.allergens), restrictions = useProfileStore((s) => s.restrictions);
  const client = useQueryClient();
  const fav = useFavorites();
  const params = { ...filterParams(filters, ""), region: "아산시", restaurant_id: restaurant.id, personalize: true,
    sort: filters.sort === "distance_asc" ? "dietary" : filters.sort, lat: origin.lat, lng: origin.lng, limit: 20 };
  const menus = useInfiniteQuery({
    queryKey: apiKeys.menus({ ...params, profile: profileSignature(allergens, restrictions), view: "restaurant-menus" }),
    initialPageParam: 1, queryFn: ({ pageParam, signal }) => getDataProvider().getMenus({ ...params, page: pageParam }, { signal }),
    getNextPageParam: (last) => last.pagination.nextPage ?? undefined,
    staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const loading = !menus.isError && !menus.isFetchingNextPage && (menus.isPending || menus.isFetching);
  return <div className="space-y-3">
    {onBack && <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-2 text-xs font-medium text-primary shadow-sm"><ArrowLeft className="size-3.5" />식당 목록으로</button>}
    <p className="text-xs text-muted">{restaurant.address} · 현재 음식·판정 조건에 맞는 메뉴</p>
    {menus.isError && <ApiErrorPanel error={menus.error} onRetry={() => void menus.refetch()} />}
    {loading ? <DiscoverySkeleton /> : menus.data?.pages.flatMap((page) => page.items).map((m) => <MenuCard key={m.id}
      item={{ id: m.id, name: m.name, restaurantName: m.restaurantName, priceAmount: m.priceAmount,
        distanceKm: showDistance ? m.distanceKm : null, status: m.judgement?.status ?? "check", saved: fav.isSaved(m.id, m.saved) }}
      onDetailIntent={() => prefetchMenuDetail(client, m.id)}
      onToggleSave={() => fav.toggleSave(m.id, { ...m, saved: fav.isSaved(m.id, m.saved) })} saving={fav.isSaving(m.id)} />)}
    {menus.isFetchingNextPage && <DiscoverySkeleton count={2} />}
    {!loading && menus.isSuccess && !menus.data.pages[0].items.length && <p className="py-5 text-center text-sm text-muted">검색 조건에 맞는 등록 메뉴가 없습니다.</p>}
    {!loading && !menus.isFetchingNextPage && menus.hasNextPage && <button type="button" disabled={menus.isFetching} onClick={() => void menus.fetchNextPage()} className="w-full rounded-2xl border border-border-strong bg-card py-3 text-sm font-medium text-primary">메뉴 더 보기</button>}
    <p className="text-[11px] text-muted">현재 지점의 판매 여부와 재료는 매장에 확인해주세요.</p>
    <Toast message={fav.saveError ?? ""} visible={!!fav.saveError} />
  </div>;
}
