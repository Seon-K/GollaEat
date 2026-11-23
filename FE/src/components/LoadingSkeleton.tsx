import { DiscoverySkeleton } from "./DiscoverySkeleton";

export type SkeletonVariant = "list" | "page" | "detail" | "reasoning" | "inquiry" | "map";

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block rounded-xl bg-shell motion-safe:animate-pulse ${className}`} />;
}

/** Content placeholders only: loading copy is available to assistive technology. */
export function LoadingSkeleton({ variant = "list", label = "콘텐츠 로딩 중" }: {
  variant?: SkeletonVariant; label?: string;
}) {
  if (variant === "list") return <DiscoverySkeleton label={label} />;
  return <div role="status" aria-label={label} aria-busy="true" className={`space-y-4 ${variant === "map" ? "h-full p-5" : "py-2"}`}>
    {variant === "map" ? <>
      <div className="flex h-full min-h-32 items-center justify-center rounded-2xl bg-shell/50" aria-hidden="true">
        <div className="w-2/3 space-y-4"><SkeletonBlock className="h-3 w-full" /><SkeletonBlock className="h-3 w-3/4" /><SkeletonBlock className="h-3 w-1/2" /></div>
      </div>
    </> : <>
      <SkeletonBlock className="h-5 w-24" />
      <SkeletonBlock className="mt-6 h-8 w-3/4" />
      <SkeletonBlock className="h-4 w-1/2" />
      {variant === "page" && <SkeletonBlock className="h-12 w-full rounded-full" />}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <SkeletonBlock className="h-7 w-28 rounded-full" />
        <SkeletonBlock className="h-4 w-full" /><SkeletonBlock className="h-4 w-4/5" />
        {variant === "inquiry" && <SkeletonBlock className="h-24 w-full" />}
      </div>
      <DiscoverySkeleton count={variant === "reasoning" ? 4 : 2} />
    </>}
  </div>;
}
