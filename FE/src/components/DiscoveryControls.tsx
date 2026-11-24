import { Search, SlidersHorizontal, CircleCheck, ArrowUpDown } from "lucide-react";
import { ExploreSelect, type ExploreSelectOption } from "@/components/ExploreSelect";
import type { DiscoveryFilters } from "@/hooks/useDiscovery";
import type { CategoryFilter } from "@/types";

const categories: ExploreSelectOption[] = [
  { id: "all", label: "전체" }, { id: "korean", label: "한식" }, { id: "chinese", label: "중식" },
  { id: "japanese", label: "일식" }, { id: "western", label: "양식" }, { id: "snack", label: "분식" }, { id: "cafe", label: "카페" },
];
const sorts = [{ id: "dietary", label: "추천순" }, { id: "price_asc", label: "낮은 가격순" }, { id: "price_desc", label: "높은 가격순" }];
const statuses = [{ id: "all", label: "판정 전체" }, { id: "match", label: "일치" }, { id: "mismatch", label: "불일치" }, { id: "check", label: "추가 확인 필요" }];

export function DiscoverySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="flex h-12 items-center gap-2 rounded-2xl border border-[#e5e8e6] bg-card px-3">
    <Search className="size-4 shrink-0 text-muted" aria-hidden />
    <input aria-label="메뉴명 또는 식당명 검색" placeholder="메뉴명 또는 식당명 검색" value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted" />
  </div>;
}

export function DiscoveryControls({ value, onChange, distance = false, showSearch = true, side = "bottom", topBoundary = 0 }: {
  value: DiscoveryFilters; onChange: (patch: Partial<DiscoveryFilters>) => void; distance?: boolean;
  showSearch?: boolean; side?: "top" | "bottom"; topBoundary?: number;
}) {
  const sortOptions = distance ? [sorts[0], { id: "distance_asc", label: "거리순" }, ...sorts.slice(1)] : sorts;
  return <div className="space-y-3">
    {showSearch && <DiscoverySearch value={value.query} onChange={(query) => onChange({ query })} />}
    <div className="relative z-20 flex flex-nowrap gap-2 overflow-x-auto scrollbar-hide py-1 -my-1">
      <ExploreSelect className="shrink-0" side={side} topBoundary={topBoundary} ariaLabel="음식 카테고리" triggerLabel={value.category === "all" ? "필터" : categories.find((o) => o.id === value.category)?.label ?? "필터"}
        triggerIcon={<SlidersHorizontal className="size-3.5" />} options={categories} value={value.category} onChange={(id) => onChange({ category: id as CategoryFilter })} />
      <ExploreSelect className="shrink-0" side={side} topBoundary={topBoundary} ariaLabel="정렬" triggerLabel={sortOptions.find((o) => o.id === value.sort)?.label ?? "추천순"}
        triggerIcon={<ArrowUpDown className="size-3.5" />} options={sortOptions} value={value.sort} onChange={(sort) => onChange({ sort })} />
      <ExploreSelect className="shrink-0" side={side} topBoundary={topBoundary} ariaLabel="식이조건 판정 필터" triggerLabel={statuses.find((o) => o.id === value.status)?.label ?? "판정 전체"}
        triggerIcon={<CircleCheck className="size-3.5" />} options={statuses} value={value.status} onChange={(status) => onChange({ status: status as DiscoveryFilters["status"] })} align="right" />
    </div>
  </div>;
}
