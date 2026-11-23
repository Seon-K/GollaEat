import { Link } from "react-router-dom";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpDown,
  ChevronDown,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ApiErrorPanel, ApiLoading } from "@/components/ApiState";
import { BottomNav } from "@/components/BottomNav";
import { BottomSheet } from "@/components/BottomSheet";
import { ExploreSelect } from "@/components/ExploreSelect";
import { MenuCard, type MenuCardModel } from "@/components/MenuCard";
import { NearbyMap } from "@/components/NearbyMap";
import { ASAN_ORIGIN } from "@/data/mock";
import { useFavorites } from "@/hooks/useFavoriteToggle";
import { useGeolocation, type UserLocation } from "@/hooks/useGeolocation";
import { CATEGORY_FILTER_LABEL } from "@/lib/api/criteriaMap";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { formatConditionBanner } from "@/lib/conditionBanner";
import { haversineKm } from "@/lib/geo";
import { useProfileStore } from "@/store/profileStore";
import type { CategoryFilter, JudgementStatus, SortOption } from "@/types";

const ASAN_LOCATION: UserLocation = {
  lat: ASAN_ORIGIN.lat,
  lng: ASAN_ORIGIN.lng,
  label: ASAN_ORIGIN.label ?? "충남 아산시",
  isGps: false,
};

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "match", label: "일치순" },
  { id: "price_asc", label: "낮은 가격순" },
  { id: "price_desc", label: "높은 가격순" },
  { id: "review", label: "리뷰순" },
];

const FILTER_OPTIONS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "korean", label: "한식" },
  { id: "chinese", label: "중식" },
  { id: "japanese", label: "일식" },
  { id: "western", label: "양식" },
  { id: "snack", label: "분식" },
  { id: "cafe", label: "카페" },
];

const STATUS_ORDER: Record<JudgementStatus, number> = {
  match: 0,
  check: 1,
  mismatch: 2,
};

export default function ExplorePage() {
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);
  const fav = useFavorites();
  const geo = useGeolocation();

  /** null이면 GPS(또는 폴백) 사용, 수동 선택 시 덮어씀 */
  const [manualOrigin, setManualOrigin] = useState<UserLocation | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("match");
  const [filter, setFilter] = useState<CategoryFilter>("all");

  const origin = manualOrigin ?? geo.location;
  const locationReady = geo.status !== "pending" || manualOrigin != null;

  const conditionBanner = formatConditionBanner(allergens, restrictions);

  const menusQuery = useQuery({
    queryKey: apiKeys.menus({
      q: query.trim() || undefined,
      personalize: true,
      lat: origin.lat,
      lng: origin.lng,
      limit: 40,
    }),
    queryFn: () =>
      getDataProvider().getMenus({
        q: query.trim() || undefined,
        personalize: true,
        lat: origin.lat,
        lng: origin.lng,
        limit: 40,
      }),
    enabled: locationReady,
  });

  const sortTriggerLabel =
    sort === "match"
      ? "추천순"
      : (SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "추천순");

  const itemsWithDistance = useMemo(() => {
    const items = menusQuery.data?.items ?? [];
    return items.map((m) => {
      if (m.distanceKm != null) return m;
      if (typeof m.lat === "number" && typeof m.lng === "number") {
        return {
          ...m,
          distanceKm: haversineKm(origin, { lat: m.lat, lng: m.lng }),
        };
      }
      return m;
    });
  }, [menusQuery.data?.items, origin]);

  const mapMarkers = useMemo(() => {
    const seen = new Set<string>();
    const markers: { id: string; name: string; lat: number; lng: number }[] =
      [];
    for (const m of itemsWithDistance) {
      if (typeof m.lat !== "number" || typeof m.lng !== "number") continue;
      const key = m.restaurantId || `${m.lat},${m.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({
        id: key,
        name: m.restaurantName || "매장",
        lat: m.lat,
        lng: m.lng,
      });
    }
    return markers;
  }, [itemsWithDistance]);

  const cards: MenuCardModel[] = useMemo(() => {
    let list = [...itemsWithDistance];
    if (filter !== "all") {
      const label = CATEGORY_FILTER_LABEL[filter];
      if (label) {
        list = list.filter((m) => m.category.includes(label));
      }
    }

    list.sort((a, b) => {
      if (sort === "price_asc") return a.priceAmount - b.priceAmount;
      if (sort === "price_desc") return b.priceAmount - a.priceAmount;
      if (sort === "review") return 0;
      const sa = a.judgement?.status ?? "check";
      const sb = b.judgement?.status ?? "check";
      const d = STATUS_ORDER[sa] - STATUS_ORDER[sb];
      if (d !== 0) return d;
      return (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
    });

    return list.map((m) => ({
      id: m.id,
      name: m.name,
      restaurantName: m.restaurantName,
      priceAmount: m.priceAmount,
      distanceKm: m.distanceKm,
      status: m.judgement?.status ?? "check",
      saved: fav.isSaved(m.id) || m.saved,
    }));
  }, [itemsWithDistance, filter, sort, fav]);

  const locationChoices: UserLocation[] = useMemo(() => {
    const list: UserLocation[] = [];
    if (geo.location.isGps) {
      list.push(geo.location);
    }
    list.push(ASAN_LOCATION);
    return list;
  }, [geo.location]);

  return (
    <main className="min-h-[100dvh] bg-background pb-24">
      <div className="px-5 pt-5">
        <button
          type="button"
          onClick={() => setLocationOpen(true)}
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary touch-target"
        >
          <MapPin className="size-4" strokeWidth={2.4} />
          {geo.status === "pending" && !manualOrigin
            ? "위치 확인 중…"
            : origin.label}
          <ChevronDown className="size-4" />
        </button>

        <h1 className="mt-3 text-[24px] font-bold leading-snug text-text">
          오늘은 어떤 메뉴가
          <br />
          먹고 싶나요?
        </h1>

        <div className="mt-4 flex h-12 items-center gap-2 rounded-2xl border border-[#e5e8e6] bg-card px-3">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메뉴명 또는 식당명 검색"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted"
            aria-label="메뉴명 또는 식당명 검색"
          />
        </div>

        <div className="mt-3">
          <span className="inline-flex items-center rounded-full bg-primary-light px-3 py-1.5 text-[12px] font-medium text-primary">
            {conditionBanner}
          </span>
        </div>

        <section className="mt-6">
          <h2 className="mb-3 text-[16px] font-bold text-text">주변 매장 지도</h2>
          <NearbyMap
            markers={mapMarkers}
            center={{ lat: origin.lat, lng: origin.lng }}
            showUserLocation={origin.isGps}
          />
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-[16px] font-bold text-text">
            내 조건에 맞는 메뉴
          </h2>
          <div className="relative z-20 mb-4 flex gap-2">
            <ExploreSelect
              triggerLabel="필터"
              triggerIcon={<SlidersHorizontal className="size-3.5" />}
              options={FILTER_OPTIONS}
              value={filter}
              onChange={(id) => setFilter(id as CategoryFilter)}
            />
            <ExploreSelect
              triggerLabel={sortTriggerLabel}
              triggerIcon={<ArrowUpDown className="size-3.5" />}
              options={SORT_OPTIONS}
              value={sort}
              onChange={(id) => setSort(id as SortOption)}
            />
          </div>

          {!locationReady || menusQuery.isLoading ? <ApiLoading /> : null}
          {menusQuery.isError ? (
            <ApiErrorPanel
              error={menusQuery.error}
              onRetry={() => void menusQuery.refetch()}
            />
          ) : null}

          {locationReady && !menusQuery.isLoading && !menusQuery.isError ? (
            <div className="space-y-3">
              {cards.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  onToggleSave={() => void fav.toggleSave(item.id)}
                  saving={fav.toggling}
                />
              ))}
              {cards.length === 0 ? (
                <p className="py-10 text-center text-[14px] text-muted">
                  조건에 맞는 메뉴가 없습니다.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <Link
        to="/ai"
        aria-label="AI 메뉴 추천"
        className="fixed bottom-20 right-[max(1rem,calc(50%-215px+1rem))] z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg"
      >
        <MessageCircle className="size-6" />
      </Link>

      <BottomNav />

      <BottomSheet
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        title="지역 선택"
      >
        <div className="space-y-1 pb-2">
          {locationChoices.map((loc) => {
            const selected =
              origin.label === loc.label &&
              Math.abs(origin.lat - loc.lat) < 1e-6 &&
              Math.abs(origin.lng - loc.lng) < 1e-6;
            return (
              <button
                key={loc.label}
                type="button"
                onClick={() => {
                  if (loc.isGps) {
                    setManualOrigin(null);
                    geo.refresh();
                  } else {
                    setManualOrigin(loc);
                  }
                  setLocationOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-[15px] touch-target ${
                  selected
                    ? "bg-primary-light font-semibold text-primary"
                    : "text-text"
                }`}
              >
                <MapPin className="size-4 shrink-0" />
                {loc.label}
              </button>
            );
          })}
          {geo.status === "denied" || geo.status === "unavailable" ? (
            <p className="px-3 pt-2 text-[12px] text-muted">
              위치 권한이 없어 아산 기준으로 안내합니다. 브라우저에서 위치
              허용 후 「현재 위치」를 다시 선택해 주세요.
            </p>
          ) : null}
          {geo.status !== "ready" && geo.status !== "pending" ? (
            <button
              type="button"
              onClick={() => {
                setManualOrigin(null);
                geo.refresh();
                setLocationOpen(false);
              }}
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-primary-light px-3 py-3 text-[14px] font-semibold text-primary touch-target"
            >
              현재 위치 다시 받기
            </button>
          ) : null}
        </div>
      </BottomSheet>
    </main>
  );
}
