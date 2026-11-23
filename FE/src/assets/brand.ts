/**
 * 브랜드 에셋 — Vite가 해시 경로로 번들하므로 배포에서도 깨지지 않음.
 * public/logo/mascot.svg 는 favicon 등 정적 링크용으로 유지.
 */
import mascotUrl from "@/assets/logo/mascot.svg?url";

export const MASCOT_SRC = mascotUrl;

export const BRAND_NAME = "골라잇" as const;
export const BRAND_EN = "GollaEat" as const;

/** favicon / apple-touch (public 고정 경로) */
export const MASCOT_PUBLIC_SRC = "/logo/mascot.svg" as const;
