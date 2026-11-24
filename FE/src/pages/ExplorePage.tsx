import { useGeolocation } from "@/hooks/useGeolocation";
import { SkeletonBlock } from "@/components/LoadingSkeleton";
import { MascotLogo } from "@/components/MascotLogo";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, MapPin, ChevronDown } from "lucide-react";
import { ApiErrorPanel } from "@/components/ApiState";
import { DiscoverySkeleton } from "@/components/DiscoverySkeleton";
import { BottomNav } from "@/components/BottomNav";
import { RestaurantCard } from "@/components/RestaurantCard";
import { RestaurantMenuList } from "@/components/RestaurantMenuList";
import type { RestaurantUi } from "@/lib/api/adapters";
import { BottomSheet } from "@/components/BottomSheet";
import { DiscoveryControls, DiscoverySearch } from "@/components/DiscoveryControls";
import { ASAN_ORIGIN } from "@/data/mock";
import { useDebounced, useDiscoveryFilters } from "@/hooks/useDiscovery";
import { profileSignature } from "@/lib/api/homeMenus";
import { homeRestaurantParams, homeRestaurantsOptions, restaurantDisplayScope } from "@/lib/api/homeRestaurants";
import { Pagination } from "@/components/Pagination";
import { formatConditionBanner } from "@/lib/conditionBanner";
import { useProfileStore } from "@/store/profileStore";

export default function ExplorePage({ bootstrapping = false }: { bootstrapping?: boolean } = {}) {
  const geo = useGeolocation({ autoRequest: !bootstrapping });
  const [useGps, setUseGps] = useState(true);
  const hasGps = useGps && geo.position !== null;
  const origin = hasGps ? geo.position! : ASAN_ORIGIN;
  const [locationOpen, setLocationOpen] = useState(false);
  const [selected, setSelected] = useState<RestaurantUi | null>(null);
  const allergens = useProfileStore((s) => s.allergens), restrictions = useProfileStore((s) => s.restrictions);
  const filters = useDiscoveryFilters((s) => s.home), update = useDiscoveryFilters((s) => s.update);
  const query = useDebounced(filters.query);
  const params = homeRestaurantParams(filters, query, origin);
  const profile = profileSignature(allergens, restrictions);
  const scope = JSON.stringify({ ...params, profile });
  const storedPage = useDiscoveryFilters((s) => s.homePage);
  const storedScope = useDiscoveryFilters((s) => s.homePageScope);
  const setPage = useDiscoveryFilters((s) => s.setHomePage);
  const page = storedScope === scope ? storedPage : 1;
  const options = homeRestaurantsOptions({ ...params, page }, profile);
  const displayScope = restaurantDisplayScope(options.queryKey[2], profile);
  const restaurantsQuery = useQuery({
    ...options, enabled: !bootstrapping,
    placeholderData: (previous, previousQuery) => {
      const prior = previousQuery?.queryKey[2] as (Record<string, unknown> & { profile?: string }) | undefined;
      if (!prior || prior.profile !== profile) return undefined;
      const { profile: priorProfile, ...priorParams } = prior;
      return restaurantDisplayScope(priorParams, priorProfile!) === displayScope ? previous : undefined;
    },
  });
  const items = restaurantsQuery.data?.items ?? [];
  const pagination = restaurantsQuery.data?.pagination;
  const changePage = (next: number) => {
    if (next === page || next < 1 || (pagination && next > pagination.totalPages)) return;
    setPage(next, scope);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const loading = bootstrapping || !restaurantsQuery.isError &&
    (restaurantsQuery.isPending || query !== filters.query);
  const updating = !loading && restaurantsQuery.isFetching;
  return <main className="min-h-[100dvh] bg-background pb-24">
    <fieldset disabled={bootstrapping} className="contents"><div className="px-5 pt-5">
      <button type="button" onClick={() => setLocationOpen(true)} className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary touch-target">
        <MapPin className="size-4" strokeWidth={2.4} />{hasGps ? "현재 위치" : "충남 아산시"}<ChevronDown className="size-4" />
      </button>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[24px] font-bold leading-snug text-text">오늘은 어떤 메뉴가<br />먹고 싶나요?</h1>
        <MascotLogo className="size-16 shrink-0 min-[380px]:size-20" alt="" />
      </div>
      <div className="mt-4"><DiscoverySearch value={filters.query} onChange={(query) => update("home", { query })} /></div>
      <div className="mt-3"><span className="inline-flex items-center rounded-full bg-primary-light px-3 py-1.5 text-[12px] font-medium text-primary">{bootstrapping ? <SkeletonBlock className="h-4 w-24" /> : formatConditionBanner(allergens, restrictions)}</span></div>
      <section className="mt-6"><h2 className="mb-3 text-[16px] font-bold text-text">내 조건에 맞는 식당</h2>
        <div className="relative z-20 mb-4"><DiscoveryControls value={filters} onChange={(patch) => update("home", patch)} showSearch={false} /></div>
        {!bootstrapping && restaurantsQuery.isError && <ApiErrorPanel error={restaurantsQuery.error} onRetry={() => void restaurantsQuery.refetch()} />}
        {updating && <div role="status" aria-label="식당 목록 갱신 중" className="mb-3 h-1 overflow-hidden rounded-full bg-primary-light"><div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse" /></div>}
        {loading ? <DiscoverySkeleton variant="restaurant" /> : <fieldset disabled={restaurantsQuery.isPlaceholderData} aria-busy={updating} className="w-full min-w-0 max-w-full space-y-3">{items.map((restaurant) => <RestaurantCard status={filters.status} key={restaurant.id} restaurant={restaurant} selected={selected?.id === restaurant.id} showDistance={hasGps && !restaurantsQuery.isPlaceholderData} onSelect={() => setSelected(restaurant)} />)}</fieldset>}
        {!loading && !updating && !restaurantsQuery.isError && !items.length && <p className="py-10 text-center text-sm text-muted">조건에 맞는 식당이 없습니다.</p>}
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} disabled={loading || updating} onChange={changePage} />}
        {!loading && !restaurantsQuery.isPlaceholderData && pagination && pagination.total > 0 && <p className="mt-3 text-center text-xs text-muted">총 {pagination.total.toLocaleString()}곳 · {page} / {pagination.totalPages}페이지</p>}
      </section>
    </div>
    </fieldset>
    {!bootstrapping && <Link to="/ai" aria-label="AI 메뉴 추천" className="fixed bottom-20 right-[max(1rem,calc(50%-215px+1rem))] z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg"><MessageCircle className="size-6" /></Link>}
    <BottomNav />
    <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
      <div className="pb-3">
        {selected && <RestaurantMenuList key={selected.id} restaurant={selected} filters={filters} origin={origin} />}
      </div>
    </BottomSheet>
    <BottomSheet open={locationOpen} onClose={() => setLocationOpen(false)} title="지역 선택">
      <div className="space-y-1 pb-2"><button type="button" onClick={() => { setUseGps(true); geo.request(); setLocationOpen(false); }} className="w-full rounded-xl px-3 py-3 text-left text-primary">현재 위치 사용</button><button type="button" onClick={() => { setUseGps(false); setLocationOpen(false); }} className="flex w-full items-center gap-2 rounded-xl bg-primary-light px-3 py-3 text-left text-[15px] font-semibold text-primary touch-target"><MapPin className="size-4 shrink-0" />충남 아산시</button></div>
    </BottomSheet>
  </main>;
}
