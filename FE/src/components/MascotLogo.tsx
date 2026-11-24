import { LOGO_NO_BG_SRC, LOGO_WITH_BG_SRC } from "@/assets/brand";

interface MascotLogoProps {
  className?: string;
  /**
   * landing: logo_with_bg.svg (스플래시 전용)
   * default: logo_no_bg.svg (그 외 모든 화면)
   */
  variant?: "landing" | "default";
  /** @deprecated variant="landing" 사용. accent-light 래퍼는 더 이상 쓰지 않음 */
  framed?: boolean;
  alt?: string;
}

/** 마스코트 로고 — @/assets/brand 의 SVG 단일 소스 */
export function MascotLogo({
  className = "size-28",
  variant = "default",
  framed = false,
  alt = "골라잇",
}: MascotLogoProps) {
  const isLanding = variant === "landing" || framed;
  const src = isLanding ? LOGO_WITH_BG_SRC : LOGO_NO_BG_SRC;

  return (
    <img
      src={src}
      alt={alt}
      className={`${className} object-contain`}
      draggable={false}
      decoding="async"
    />
  );
}
