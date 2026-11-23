import { SkeletonBlock } from "./LoadingSkeleton";

/** Mirrors MenuDetailPage without showing a provisional dietary judgement. */
export function MenuDetailSkeleton() {
  return <main role="status" aria-label="메뉴 상세 로딩 중" aria-busy="true" className="min-h-[100dvh] bg-background pb-40">
    <div aria-hidden="true">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-background/95 px-3 backdrop-blur">
        <SkeletonBlock className="h-5 w-24" /><SkeletonBlock className="mx-2 size-5" />
      </header>
      <div className="space-y-4 px-5">
        <section className="rounded-2xl border border-border bg-card p-4">
          <SkeletonBlock className="h-7 w-3/4" />
          <SkeletonBlock className="mt-1 h-5 w-1/2" />
          <SkeletonBlock className="mt-2 h-6 w-24" />
        </section>
        <section className="space-y-3 rounded-2xl bg-shell/50 px-5 py-5">
          <div className="flex items-center gap-2"><SkeletonBlock className="size-5 rounded-full" /><SkeletonBlock className="h-6 w-32" /></div>
          <SkeletonBlock className="h-5 w-full" /><SkeletonBlock className="h-4 w-4/5" />
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="mt-3 h-5 w-4/5" /><SkeletonBlock className="mt-2 h-5 w-3/5" />
          <SkeletonBlock className="mt-2 h-4 w-full" />
          <div className="mt-3 flex min-h-11 items-center justify-between"><SkeletonBlock className="h-5 w-40" /><SkeletonBlock className="size-4" /></div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <SkeletonBlock className="h-5 w-40" /><SkeletonBlock className="mt-3 h-4 w-full" />
          <div className="mt-3 flex min-h-11 items-center justify-between"><SkeletonBlock className="h-5 w-32" /><SkeletonBlock className="size-4" /></div>
        </section>
        <section>
          <SkeletonBlock className="mb-3 h-5 w-20" />
          <SkeletonBlock className="h-36 w-full rounded-2xl" />
          <SkeletonBlock className="mt-3 h-12 w-full rounded-2xl" />
        </section>
        <section>
          <SkeletonBlock className="h-5 w-32" /><SkeletonBlock className="mt-1 h-4 w-3/4" />
          <div className="mt-3 space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2"><SkeletonBlock className="size-8 rounded-full" /><SkeletonBlock className="h-4 w-16" /><SkeletonBlock className="h-6 w-20 rounded-full" /></div>
            <SkeletonBlock className="h-5 w-full" /><SkeletonBlock className="h-3 w-4/5" />
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <SkeletonBlock className="mb-3 h-5 w-24" /><SkeletonBlock className="h-24 w-full" />
          <div className="mt-2 flex justify-end"><SkeletonBlock className="h-10 w-24 rounded-full" /></div>
        </section>
      </div>
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-phone -translate-x-1/2 bg-background/95 px-5 pt-2 backdrop-blur safe-bottom">
        <div className="mb-2 flex justify-end"><SkeletonBlock className="h-11 w-40 rounded-full" /></div>
        <SkeletonBlock className="h-14 w-full rounded-[28px]" />
      </div>
    </div>
  </main>;
}
