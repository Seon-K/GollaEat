"use client";

import type { ReactNode } from "react";

/**
 * 모바일 우선 셸 — 최대 430px 중앙 정렬
 * 데스크톱에서는 390×844에 가까운 폰 프레임처럼 보이도록 그림자·배경 처리
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full justify-center bg-shell px-0 sm:px-4 sm:py-6">
      <div className="relative w-full max-w-phone min-h-[100dvh] overflow-x-hidden bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.04)] sm:min-h-[min(844px,100dvh)] sm:rounded-[28px] sm:shadow-[0_12px_40px_rgba(37,42,39,0.12)]">
        <div
          className="pointer-events-none h-[env(safe-area-inset-top,0px)] min-h-0"
          aria-hidden
        />
        <div className="pt-3">{children}</div>
      </div>
    </div>
  );
}
