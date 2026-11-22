"use client";

import { useEffect } from "react";

/** 화면 켜짐 유지 — Wake Lock API 지원 시에만 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    if (!("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // 권한/정책으로 실패해도 화면은 정상 동작
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        void request();
      }
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
      lock = null;
    };
  }, [enabled]);
}
