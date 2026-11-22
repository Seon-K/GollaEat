import { MapPin } from "lucide-react";

const PINS = [
  { id: "green-kitchen", name: "그린키친", x: 32, y: 38 },
  { id: "ongi-noodle", name: "온기국수", x: 62, y: 58 },
] as const;

/** 디자인용 정적 SVG 지도 (지도 SDK 없음) */
export function NearbyMap() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#e8f2ec]">
      <svg
        viewBox="0 0 360 168"
        className="block h-40 w-full"
        role="img"
        aria-label="주변 매장 지도"
      >
        <rect width="360" height="168" fill="#e8f2ec" />
        {/* 블록 */}
        <rect x="16" y="20" width="72" height="48" rx="10" fill="#d3e8db" />
        <rect x="100" y="16" width="90" height="40" rx="10" fill="#cfe5d8" />
        <rect x="210" y="24" width="64" height="56" rx="10" fill="#d9ebe1" />
        <rect x="286" y="18" width="54" height="42" rx="10" fill="#c8e0d2" />
        <rect x="24" y="88" width="80" height="52" rx="10" fill="#d5e9de" />
        <rect x="120" y="78" width="70" height="60" rx="10" fill="#cde4d6" />
        <rect x="210" y="96" width="96" height="44" rx="10" fill="#d8ebe2" />
        <rect x="318" y="78" width="28" height="70" rx="8" fill="#cfe5d8" />
        {/* 도로 */}
        <path
          d="M0 72 H360 M0 84 H360 M148 0 V168 M160 0 V168 M248 0 V168"
          stroke="#fafaf7"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M0 78 H360 M154 0 V168"
          stroke="#ffffff"
          strokeWidth="2"
          opacity="0.7"
        />
      </svg>

      {PINS.map((pin) => (
        <span
          key={pin.id}
          className="absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-primary/20 bg-card px-2.5 py-1 text-[12px] font-semibold text-primary shadow-sm"
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
        >
          <MapPin className="size-3.5 shrink-0" strokeWidth={2.4} />
          {pin.name}
        </span>
      ))}

      <p className="absolute bottom-2 left-3 text-[11px] text-muted">
        지도는 위치 확인용 예시입니다.
      </p>
    </div>
  );
}
