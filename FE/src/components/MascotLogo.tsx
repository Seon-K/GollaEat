import { MASCOT_LINE_SRC, MASCOT_SRC } from "@/assets/brand";

interface MascotLogoProps {
  className?: string;
  /**
   * accent-light 라운드 박스 래퍼.
   * true면 투명 라인 로고(MASCOT_LINE_SRC)를 씁니다.
   * false(기본)면 크림 배경 포함 확정 로고(MASCOT_SRC).
   */
  framed?: boolean;
  alt?: string;
}

/** 마스코트 로고 — @/assets/brand 단일 소스 */
export function MascotLogo({
  className = "size-28",
  framed = false,
  alt = "골라잇",
}: MascotLogoProps) {
  const src = framed ? MASCOT_LINE_SRC : MASCOT_SRC;

  const img = (
    <img
      src={src}
      alt={alt}
      className={framed ? "size-[72%] object-contain" : className}
      draggable={false}
      decoding="async"
    />
  );

  if (!framed) return img;

  return (
    <div
      className={`flex items-center justify-center rounded-[36px] bg-accent-light ${className}`}
    >
      {img}
    </div>
  );
}
