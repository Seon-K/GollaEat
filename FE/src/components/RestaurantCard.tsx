import { AlertTriangle, CheckCircle2, XCircle, ChevronRight, MapPin, Utensils } from "lucide-react";
import type { RestaurantUi } from "@/lib/api/adapters";
import type { DiscoveryFilters } from "@/hooks/useDiscovery";

const verdicts = [
  { status: "match", key: "match_menu_count", label: "일치", Icon: CheckCircle2, color: "bg-primary-light text-primary" },
  { status: "mismatch", key: "mismatch_menu_count", label: "불일치", Icon: XCircle, color: "bg-error-light text-error" },
  { status: "check", key: "check_menu_count", label: "추가 확인 필요", Icon: AlertTriangle, color: "bg-accent-light text-accent-text" },
] as const;

export function RestaurantCard({ restaurant: r, selected, onSelect, showDistance, status = "all" }: {
  restaurant: RestaurantUi; selected: boolean; onSelect: () => void; showDistance: boolean;
  status?: DiscoveryFilters["status"];
}) {
  return <article id={`restaurant-${r.id}`} className={`rounded-2xl border bg-card shadow-sm transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
    <button type="button" onClick={onSelect} aria-label={`${r.name} 메뉴 보기`} aria-pressed={selected} className="flex w-full items-start gap-3 p-4 text-left hover:bg-primary-light/40 rounded-2xl">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary"><Utensils className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{r.name}</span>
        <span className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3 shrink-0" /><span className="truncate">{r.address || "주소 확인 필요"}</span></span>
        {showDistance && r.distanceKm != null && <span className="mt-1 block text-xs text-muted">내 위치에서 {r.distanceKm.toFixed(1)}km</span>}
        {r.personalization?.applied && r.dietarySummary ? <span className="mt-2 flex flex-wrap gap-1.5">
          {verdicts.filter((verdict) => status === "all" || verdict.status === status).map(({ key, label, Icon, color }) =>
            <span key={key} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${color}`}>
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />{label} {r.dietarySummary?.[key] ?? 0}개
            </span>)}
        </span> : <span className="mt-2 inline-block rounded-full bg-shell px-2 py-1 text-xs text-muted">식이조건 설정 후 판정 확인</span>}
        {r.personalization?.applied && !r.personalization.profile_configured && <span className="mt-1 block text-xs text-muted">식이조건 미설정 · 모든 메뉴 일치</span>}
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
    </button>
  </article>;
}
