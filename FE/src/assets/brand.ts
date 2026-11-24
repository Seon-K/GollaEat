/**
 * 브랜드 로고 — src/assets/logo의 SVG만 사용 (Vite 해시 URL)
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

/** @deprecated favicon도 동일한 원본을 사용하며 빌드 시 해시 URL로 변환됨 */
export const MASCOT_PUBLIC_SRC = LOGO_WITH_BG_SRC;
