import { MapPin } from "lucide-react";

/** 메뉴 상세용 단일 매장 예시 지도 */
export function StoreMap({ storeName }: { storeName: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#e8f2ec]">
      <svg
        viewBox="0 0 360 160"
        className="block h-36 w-full"
        role="img"
        aria-label={`${storeName} 위치 예시 지도`}
      >
        <rect width="360" height="160" fill="#e8f2ec" />
        <rect x="20" y="18" width="70" height="44" rx="10" fill="#d3e8db" />
        <rect x="108" y="14" width="88" height="40" rx="10" fill="#cfe5d8" />
        <rect x="214" y="22" width="60" height="52" rx="10" fill="#d9ebe1" />
        <rect x="290" y="16" width="50" height="40" rx="10" fill="#c8e0d2" />
        <rect x="28" y="84" width="78" height="48" rx="10" fill="#d5e9de" />
        <rect x="124" y="76" width="72" height="56" rx="10" fill="#cde4d6" />
        <rect x="214" y="92" width="100" height="40" rx="10" fill="#d8ebe2" />
        <path
          d="M0 70 H360 M0 82 H360 M150 0 V160 M162 0 V160"
          stroke="#fafaf7"
          strokeWidth="6"
        />
        <path d="M0 76 H360 M156 0 V160" stroke="#fff" strokeWidth="2" opacity="0.7" />
      </svg>
      <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-primary/20 bg-card px-2.5 py-1 text-[12px] font-semibold text-primary shadow-sm">
        <MapPin className="size-3.5" strokeWidth={2.4} />
        {storeName}
      </span>
    </div>
  );
}
