import type { NavigateFunction } from "react-router-dom";

type HistoryState = { idx?: number; usr?: unknown };

/**
 * SPA history 스택이 있으면 back, 없으면 fallback.
 * history.length 는 신뢰하지 않음(거의 항상 > 1).
 */
export function navigateBack(navigate: NavigateFunction, fallbackHref: string) {
  if (typeof window === "undefined") {
    navigate(fallbackHref);
    return;
  }
  const state = window.history.state as HistoryState | null;
  const idx = state?.idx;
  if (typeof idx === "number" && idx > 0) {
    navigate(-1);
    return;
  }
  // React Router 없이 쌓인 경우도 대비
  if (window.history.length > 1 && document.referrer) {
    navigate(-1);
    return;
  }
  navigate(fallbackHref);
}
