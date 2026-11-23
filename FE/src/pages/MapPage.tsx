import { SkeletonBlock } from "@/components/LoadingSkeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { create } from "zustand";
import { LocateFixed } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { DiscoveryControls, DiscoverySearch } from "@/components/DiscoveryControls";
import { KakaoMapView, type MapViewport } from "@/components/KakaoMapView";
import { RestaurantCard } from "@/components/RestaurantCard";
import { MapResultsSheet } from "@/components/MapResultsSheet";
import { RestaurantMenuList } from "@/components/RestaurantMenuList";
import { DiscoverySkeleton } from "@/components/DiscoverySkeleton";
import { ApiErrorPanel } from "@/components/ApiState";
import { ASAN_ORIGIN } from "@/data/mock";
import { useGeolocation, type GeoPoint } from "@/hooks/useGeolocation";
import { filterParams, useDebounced, useDiscoveryFilters } from "@/hooks/useDiscovery";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { formatConditionBanner } from "@/lib/conditionBanner";
import { useProfileStore } from "@/store/profileStore";
import type { RestaurantUi } from "@/lib/api/adapters";

interface MapState {
  viewport: MapViewport | null; origin: GeoPoint; user: GeoPoint | null;
  patch: (value: Partial<Omit<MapState, "patch">>) => void;
}
const useMapState = create<MapState>((set) => ({ viewport: null, origin: ASAN_ORIGIN, user: null, patch: (value) => set(value) }));
const GEO_MESSAGES = { idle: "현재 위치 버튼으로 주변 식당을 찾아보세요.", loading: "현재 위치를 확인하고 있어요…", success: "현재 위치를 확인했습니다.", denied: "위치 권한이 거부되었습니다. 지도를 움직여 탐색해주세요.", timeout: "위치 확인 시간이 초과되었습니다. 다시 시도해주세요.", error: "위치를 확인하지 못했습니다. 지도를 움직여 탐색해주세요.", unsupported: "위치 조회를 지원하지 않는 환경입니다. 지도에서 탐색해주세요." };

export default function MapPage() {
  const filters = useDiscoveryFilters((s) => s.map), update = useDiscoveryFilters((s) => s.update);
  const state = useMapState(), geo = useGeolocation();
  const allergens = useProfileStore((s) => s.allergens), restrictions = useProfileStore((s) => s.restrictions);
  const query = useDebounced(filters.query);
  const searchViewport = useDebounced(state.viewport, 450);
  const [moveTo, setMoveTo] = useState<GeoPoint | null>(null);
  const [selected, setSelected] = useState<RestaurantUi | null>(null);
  const [sheetHeight, setSheetHeight] = useState(300);
  const [controlsHeight, setControlsHeight] = useState(230);
  const headerRef = useRef<HTMLElement>(null);
  const areaTooWide = searchViewport ? (() => {
    const [w, s, e, n] = searchViewport.bounds.split(",").map(Number);
    return e - w > 2 || n - s > 2;
  })() : false;
  const origin = state.user ?? searchViewport?.center ?? state.origin;
  const params = { view: "card" as const, ...filterParams(filters, query), region: "아산시", personalize: true,
    lat: origin.lat, lng: origin.lng, ...(searchViewport ? { bounds: searchViewport.bounds } : { radius_km: 3 }), limit: 20 };
  const results = useInfiniteQuery({ queryKey: apiKeys.restaurants({ ...params, profile: [allergens, restrictions] }),
    enabled: !areaTooWide, placeholderData: keepPreviousData, initialPageParam: 1,
    queryFn: ({ pageParam }) => getDataProvider().getRestaurants({ ...params, page: pageParam }),
    getNextPageParam: (last) => last.pagination.nextPage ?? undefined });
  const restaurants = useMemo(() => {
    const seen = new Set<string>();
    return (results.data?.pages.flatMap((p) => p.items) ?? []).filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id); return true;
    });
  }, [results.data]);
  const markers = useMemo(() => restaurants.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)).map((r) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng })), [restaurants]);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const header = headerRef.current;
    const observer = new ResizeObserver(() => { if (header) setControlsHeight(header.getBoundingClientRect().bottom); });
    if (header) observer.observe(header);
    return () => { document.body.style.overflow = old; observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!geo.position) return;
    useMapState.getState().patch({ user: geo.position, origin: geo.position });
    setMoveTo(geo.position);
  }, [geo.position]);
  useEffect(() => {
    if (selected && !results.isPlaceholderData && results.isSuccess && !restaurants.some((r) => r.id === selected.id)) setSelected(null);
  }, [restaurants, results.isPlaceholderData, results.isSuccess, selected]);
  const choose = (id: string) => {
    if (restaurantLoading) return;
    const restaurant = restaurants.find((r) => r.id === id);
    if (restaurant) setSelected(restaurant);
  };
  const moving = state.viewport?.bounds !== searchViewport?.bounds;
  const restaurantLoading = !areaTooWide && !results.isError && !results.isFetchingNextPage &&
    (moving || query !== filters.query || results.isPending || results.isFetching || results.isPlaceholderData);
  const total = results.data?.pages[0]?.pagination.total ?? 0;
  return <main className="fixed inset-y-0 left-1/2 z-10 w-full max-w-phone -translate-x-1/2 overflow-hidden bg-background" aria-label="지도에서 식당 찾기">
    <div className="absolute inset-0"><KakaoMapView interactive markers={markers} fallbackCenter={state.viewport?.center ?? state.origin} initialLevel={state.viewport?.level ?? 5}
      heightClassName="h-full" className="h-full !rounded-none" selectedId={selected?.id} onMarkerSelect={choose}
      onViewportChange={(viewport) => state.patch({ viewport })} currentPosition={state.user} moveTo={moveTo} /></div>
    <header ref={headerRef} className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="pointer-events-auto space-y-2.5 rounded-3xl border border-white/80 bg-card/95 p-3 shadow-[0_4px_24px_rgba(37,42,39,0.1)] backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 px-1"><h1 className="shrink-0 text-base font-bold">내 조건에 맞는 식당</h1><span className="min-w-0 truncate text-right text-[11px] font-medium text-primary" title={formatConditionBanner(allergens, restrictions)}>{formatConditionBanner(allergens, restrictions)}</span></div>
        <DiscoverySearch value={filters.query} onChange={(query) => update("map", { query })} />
      </div>
    </header>
    <div className="pointer-events-none absolute inset-x-4 z-10 flex items-end justify-between gap-3 transition-[bottom] duration-300"
      style={{ bottom: `calc(${sheetHeight}px + 56px + max(16px,env(safe-area-inset-bottom)) + 12px)` }}>
      {!restaurantLoading && <p className="max-w-[75%] rounded-2xl bg-card/95 px-3 py-2 text-[11px] text-muted shadow-sm">
        {areaTooWide ? "지도를 확대하면 이 지역의 식당을 추천해드려요." : "지도를 움직이면 이 화면의 식당을 추천해드려요."}
      </p>}
      <button type="button" aria-label="현재 위치 사용" title="현재 위치 사용" disabled={geo.status === "loading"} onClick={geo.request}
        className="pointer-events-auto ml-auto flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border-strong bg-card text-primary shadow-md">
        {geo.status === "loading" ? <SkeletonBlock className="size-5" /> : <LocateFixed className="size-5" />}
      </button>
    </div>
    <MapResultsSheet expanded={!!selected} onHeightChange={setSheetHeight} controlsHeight={controlsHeight}
      controls={<DiscoveryControls value={filters} onChange={(patch) => update("map", patch)} distance showSearch={false} side="top" topBoundary={controlsHeight + 12} />}
      title={selected ? selected.name : "이 지도에서 추천하는 식당"}
      subtitle={selected ? "메뉴 카드를 누르면 상세 정보를 볼 수 있어요" : restaurantLoading ? <span aria-hidden="true" className="inline-block h-3 w-40 rounded-full bg-shell motion-safe:animate-pulse" /> : `총 ${total}곳 중 ${restaurants.length}곳 표시 · ${state.user ? "내 위치 기준 거리" : "지도 영역 기준"}`}>
      <p className="text-[11px] text-muted">{geo.status === "loading" ? <span role="status" aria-label="위치 확인 중"><SkeletonBlock className="h-3 w-40" /></span> : GEO_MESSAGES[geo.status]} {!state.user && !state.viewport && "기본 지역: 충남 아산시"}</p>
      {selected ? <RestaurantMenuList key={selected.id} restaurant={selected} filters={filters} origin={origin} showDistance={!!state.user} onBack={() => setSelected(null)} /> : <>
        {results.isError && <ApiErrorPanel error={results.error} onRetry={() => void results.refetch()} />}
        {!restaurantLoading && !results.isError && !restaurants.length && <p className="py-6 text-center text-sm text-muted">조건에 맞는 식당이 없습니다.<br />지도를 이동하거나 필터를 바꿔보세요.</p>}
        {restaurantLoading ? <DiscoverySkeleton variant="restaurant" /> : restaurants.map((r) => <RestaurantCard status={filters.status} key={r.id} restaurant={r} selected={false} showDistance={!!state.user} onSelect={() => choose(r.id)} />)}
        {results.isFetchingNextPage && <DiscoverySkeleton variant="restaurant" count={2} />}
        {!restaurantLoading && !results.isFetchingNextPage && results.hasNextPage && <button type="button" disabled={results.isFetching || results.isPlaceholderData || moving || areaTooWide} onClick={() => void results.fetchNextPage()} className="w-full rounded-2xl border border-border-strong bg-card py-3 text-sm font-medium text-primary">식당 더 보기</button>}
        <p className="text-[11px] text-muted">지도에는 불러온 식당만 표시됩니다. 메뉴 일치는 식당 전체의 안전을 보장하지 않습니다.</p>
      </>}
    </MapResultsSheet>
    <BottomNav />
  </main>;
}
