import { useGeolocation } from "@/hooks/useGeolocation";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
import { filterParams, useDebounced, useDiscoveryFilters } from "@/hooks/useDiscovery";
import { profileSignature } from "@/lib/api/homeMenus";
import { homeRestaurantsOptions } from "@/lib/api/homeRestaurants";
import { Pagination } from "@/components/Pagination";
import { formatConditionBanner } from "@/lib/conditionBanner";
import { useProfileStore } from "@/store/profileStore";

export default function ExplorePage() {
  const geo = useGeolocation({ autoRequest: true });
  const [useGps, setUseGps] = useState(true);
  const hasGps = useGps && geo.position !== null;
  const origin = hasGps ? geo.position! : ASAN_ORIGIN;
  const [locationOpen, setLocationOpen] = useState(false);
  const [selected, setSelected] = useState<RestaurantUi | null>(null);
  const allergens = useProfileStore((s) => s.allergens), restrictions = useProfileStore((s) => s.restrictions);
  const filters = useDiscoveryFilters((s) => s.home), update = useDiscoveryFilters((s) => s.update);
  const query = useDebounced(filters.query);
  const params = { ...filterParams(filters, query), region: "아산시", personalize: true, lat: origin.lat, lng: origin.lng };
  const profile = profileSignature(allergens, restrictions);
  const scope = JSON.stringify({ ...params, profile });
  const storedPage = useDiscoveryFilters((s) => s.homePage);
  const storedScope = useDiscoveryFilters((s) => s.homePageScope);
  const setPage = useDiscoveryFilters((s) => s.setHomePage);
  const page = storedScope === scope ? storedPage : 1;
  const restaurantsQuery = useQuery({ ...homeRestaurantsOptions({ ...params, page }, profile), placeholderData: keepPreviousData });
  const items = restaurantsQuery.data?.items ?? [];
  const pagination = restaurantsQuery.data?.pagination;
  const changePage = (next: number) => {
    if (next === page || next < 1 || (pagination && next > pagination.totalPages)) return;
    setPage(next, scope);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const loading = !restaurantsQuery.isError &&
    (restaurantsQuery.isPending || restaurantsQuery.isFetching || restaurantsQuery.isPlaceholderData || query !== filters.query);
  return <main className="min-h-[100dvh] bg-background pb-24">
    <div className="px-5 pt-5">
      <button type="button" onClick={() => setLocationOpen(true)} className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary touch-target">
        <MapPin className="size-4" strokeWidth={2.4} />{hasGps ? "현재 위치" : "충남 아산시"}<ChevronDown className="size-4" />
      </button>
      <h1 className="mt-3 text-[24px] font-bold leading-snug text-text">오늘은 어떤 메뉴가<br />먹고 싶나요?</h1>
      <div className="mt-4"><DiscoverySearch value={filters.query} onChange={(query) => update("home", { query })} /></div>
      <div className="mt-3"><span className="inline-flex items-center rounded-full bg-primary-light px-3 py-1.5 text-[12px] font-medium text-primary">{formatConditionBanner(allergens, restrictions)}</span></div>
      <section className="mt-6"><h2 className="mb-3 text-[16px] font-bold text-text">내 조건에 맞는 식당</h2>
        <div className="relative z-20 mb-4"><DiscoveryControls value={filters} onChange={(patch) => update("home", patch)} showSearch={false} /></div>
        {restaurantsQuery.isError && <ApiErrorPanel error={restaurantsQuery.error} onRetry={() => void restaurantsQuery.refetch()} />}
        {loading ? <DiscoverySkeleton variant="restaurant" /> : <div className="space-y-3">{items.map((restaurant) => <RestaurantCard status={filters.status} key={restaurant.id} restaurant={restaurant} selected={selected?.id === restaurant.id} showDistance={hasGps} onSelect={() => setSelected(restaurant)} />)}</div>}
        {!loading && !restaurantsQuery.isError && !items.length && <p className="py-10 text-center text-sm text-muted">조건에 맞는 식당이 없습니다.</p>}
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} disabled={loading} onChange={changePage} />}
        {!loading && pagination && pagination.total > 0 && <p className="mt-3 text-center text-xs text-muted">총 {pagination.total.toLocaleString()}곳 · {page} / {pagination.totalPages}페이지</p>}
      </section>
    </div>
    <Link to="/ai" aria-label="AI 메뉴 추천" className="fixed bottom-20 right-[max(1rem,calc(50%-215px+1rem))] z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg"><MessageCircle className="size-6" /></Link>
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
