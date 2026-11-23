/**
 * 브랜드 에셋 — 확정 로고 PNG (Vite 번들).
 * public/logo/* 는 favicon 등 정적 경로용.
 */
import mascotUrl from "@/assets/logo/mascot.png?url";
import mascotLineUrl from "@/assets/logo/mascot-line.png?url";

/** 스플래시·앱 아이콘용 (크림 배경 포함) */
export const MASCOT_SRC = mascotUrl;

/** 워드마크·인라인용 (투명 배경 라인 아트) */
export const MASCOT_LINE_SRC = mascotLineUrl;

export const BRAND_NAME = "골라잇" as const;
export const BRAND_EN = "GollaEat" as const;

/** favicon / apple-touch (public 고정 경로) */
export const MASCOT_PUBLIC_SRC = "/logo/mascot.png" as const;
