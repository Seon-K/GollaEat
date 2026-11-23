/**
 * 브랜드 로고 — 확정 SVG
 * - 랜딩(스플래시): logo_with_bg.svg
 * - 그 외 모든 화면: logo_no_bg.svg
 */
import logoWithBgUrl from "@/assets/logo/logo_with_bg.svg?url";
import logoNoBgUrl from "@/assets/logo/logo_no_bg.svg?url";

/** 랜딩(스플래시) 전용 — 크림 배경 포함 */
export const LOGO_WITH_BG_SRC = logoWithBgUrl;

/** 나머지 페이지·워드마크·파비콘 — 투명 배경 */
export const LOGO_NO_BG_SRC = logoNoBgUrl;

/** @deprecated LOGO_WITH_BG_SRC 사용 */
export const MASCOT_SRC = LOGO_WITH_BG_SRC;
/** @deprecated LOGO_NO_BG_SRC 사용 */
export const MASCOT_LINE_SRC = LOGO_NO_BG_SRC;

export const BRAND_NAME = "골라잇" as const;
export const BRAND_EN = "GollaEat" as const;

/** favicon / apple-touch (public 고정 경로) */
export const MASCOT_PUBLIC_SRC = "/logo/logo_with_bg.svg" as const;
