export function DiscoverySkeleton({ variant = "menu", count = 3, label }: {
  variant?: "menu" | "restaurant"; count?: number; label?: string;
}) {
  return <div className="space-y-3" role="status" aria-label={label ?? (variant === "menu" ? "메뉴 목록 로딩 중" : "식당 목록 로딩 중")} aria-busy="true">
    {Array.from({ length: count }, (_, index) => <div key={index} aria-hidden="true"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm motion-safe:animate-pulse">
      <div className="flex gap-3">
        {variant === "restaurant" && <div className="size-11 shrink-0 rounded-2xl bg-shell" />}
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-4 w-3/5 rounded-full bg-shell" />
          <div className="h-3 w-4/5 rounded-full bg-shell" />
          {variant === "restaurant" && <div className="h-3 w-2/5 rounded-full bg-shell" />}
          <div className="h-6 w-24 rounded-full bg-primary-light" />
        </div>
      </div>
    </div>)}
  </div>;
}
