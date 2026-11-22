import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type HistoryState = { idx?: number };

/**
 * App Router soft-nav 스택이 있으면 back, 없으면 fallback.
 * history.length 는 신뢰하지 않음(거의 항상 > 1).
 */
export function navigateBack(router: AppRouterInstance, fallbackHref: string) {
  if (typeof window === "undefined") {
    router.push(fallbackHref);
    return;
  }
  const idx = (window.history.state as HistoryState | null)?.idx;
  if (typeof idx === "number" && idx > 0) {
    router.back();
    return;
  }
  router.push(fallbackHref);
}
