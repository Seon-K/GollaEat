import { MASCOT_SRC } from "@/assets/brand";

interface MascotLogoProps {
  className?: string;
  /** accent-light 라운드 박스 래퍼 (스플래시용) */
  framed?: boolean;
  alt?: string;
}

/** 마스코트 로고 — src는 @/assets/brand 의 MASCOT_SRC 단일 소스 */
export function MascotLogo({
  className = "size-28",
  framed = false,
  alt = "골라잇",
}: MascotLogoProps) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={MASCOT_SRC}
      alt={alt}
      className={framed ? "size-[72%] object-contain" : className}
      draggable={false}
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
