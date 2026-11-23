import { LOGO_NO_BG_SRC, BRAND_EN } from "@/assets/brand";

/** p17 메인 로고 · 워드마크 (logo_no_bg + GollaEat) */
export function Wordmark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const mascot = size === "sm" ? "size-8" : "size-12";
  const text = size === "sm" ? "text-[20px]" : "text-[28px]";

  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      aria-label={`${BRAND_EN} 로고`}
    >
      <img
        src={LOGO_NO_BG_SRC}
        alt=""
        className={`${mascot} object-contain`}
        draggable={false}
        decoding="async"
      />
      <span
        className={`${text} font-bold tracking-tight text-[#5D4037]`}
        style={{ fontFamily: "var(--font-inter), Pretendard, sans-serif" }}
      >
        {BRAND_EN}
      </span>
    </div>
  );
}
