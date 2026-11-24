import { AlertTriangle, CheckCircle2, XCircle, ChevronRight, MapPin, Utensils } from "lucide-react";
import type { RestaurantUi } from "@/lib/api/adapters";
import type { DiscoveryFilters } from "@/hooks/useDiscovery";
import { useCallback, useEffect, useRef, useState } from "react";

const verdicts = [
  { status: "match", key: "match_menu_count", label: "일치", Icon: CheckCircle2, color: "bg-primary-light text-primary" },
  { status: "mismatch", key: "mismatch_menu_count", label: "불일치", Icon: XCircle, color: "bg-error-light text-error" },
  { status: "check", key: "check_menu_count", label: "추가 확인 필요", Icon: AlertTriangle, color: "bg-accent-light text-accent-text" },
] as const;

export function RestaurantCard({ restaurant: r, selected, onSelect, showDistance, status = "all" }: {
  restaurant: RestaurantUi; selected: boolean; onSelect: () => void; showDistance: boolean;
  status?: DiscoveryFilters["status"];
}) {
  const tagsRef = useRef<HTMLDivElement>(null);
  const [fadeRight, setFadeRight] = useState(false);
  const updateFade = useCallback(() => {
    const node = tagsRef.current;
    setFadeRight(Boolean(node && node.scrollWidth - node.clientWidth - node.scrollLeft > 1));
  }, []);
  useEffect(() => {
    const node = tagsRef.current;
    if (!node) return;
    updateFade();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateFade);
    observer?.observe(node);
    window.addEventListener('resize', updateFade);
    return () => { observer?.disconnect(); window.removeEventListener('resize', updateFade); };
  }, [updateFade, status, r.dietarySummary, r.personalization?.applied]);
  const edgeMask = fadeRight ? 'linear-gradient(to right, black calc(100% - 28px), transparent)' : undefined;
  return <article id={`restaurant-${r.id}`} className={`w-full min-w-0 max-w-full overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
    <button type="button" onClick={onSelect} aria-label={`${r.name} 메뉴 보기`} aria-pressed={selected} className="flex w-full min-w-0 max-w-full items-start gap-3 p-4 pb-0 text-left hover:bg-primary-light/40 rounded-2xl">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary"><Utensils className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{r.name}</span>
        <span className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3 shrink-0" /><span className="truncate">{r.address || "주소 확인 필요"}</span></span>
        {showDistance && r.distanceKm != null && <span className="mt-1 block text-xs text-muted">내 위치에서 {r.distanceKm.toFixed(1)}km</span>}
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
    </button>
    <div className="mt-2 min-w-0 max-w-full pb-4 pl-[72px] pr-4">
        {r.personalization?.applied && r.dietarySummary ? <div ref={tagsRef} onScroll={updateFade} style={{ maskImage: edgeMask, WebkitMaskImage: edgeMask }} role="group" aria-label="메뉴 판정 수 · 좌우로 스크롤" tabIndex={0} className="scrollbar-hide flex w-full min-w-0 flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
          {verdicts.filter((verdict) => status === "all" || verdict.status === status).map(({ key, label, Icon, color }) =>
            <span key={key} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium ${color}`}>
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />{label} {r.dietarySummary?.[key] ?? 0}개
            </span>)}
        </div> : <span className="inline-block rounded-full bg-shell px-2 py-1 text-xs text-muted">식이조건 설정 후 판정 확인</span>}
        {r.personalization?.applied && !r.personalization.profile_configured && <span className="mt-1 block text-xs text-muted">식이조건 미설정 · 모든 메뉴 일치</span>}
    </div>
  </article>;
}
