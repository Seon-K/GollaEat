import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { getKakaoMapAppKey, loadKakaoMaps } from "@/lib/kakaoMap";

export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface KakaoMapViewProps {
  markers: MapMarker[];
  /** 마커가 없을 때 중심 */
  fallbackCenter?: { lat: number; lng: number };
  className?: string;
  heightClassName?: string;
  ariaLabel?: string;
}

export function KakaoMapView({
  markers,
  fallbackCenter = { lat: 36.7898, lng: 127.0017 },
  className = "",
  heightClassName = "h-40",
  ariaLabel = "지도",
}: KakaoMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!getKakaoMapAppKey()) {
      setError("지도 API 키가 설정되지 않았습니다.");
      return;
    }

    let cancelled = false;
    setError(null);
    setReady(false);

    void loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;

        const centerSrc = markers[0] ?? fallbackCenter;
        const center = new kakao.maps.LatLng(centerSrc.lat, centerSrc.lng);
        const map = new kakao.maps.Map(containerRef.current, {
          center,
          level: markers.length > 1 ? 5 : 3,
        });

        const bounds = new kakao.maps.LatLngBounds();
        for (const m of markers) {
          const pos = new kakao.maps.LatLng(m.lat, m.lng);
          bounds.extend(pos);
          const marker = new kakao.maps.Marker({
            position: pos,
            map,
            title: m.name,
          });
          const info = new kakao.maps.InfoWindow({
            content: `<div style="padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap;">${escapeHtml(m.name)}</div>`,
          });
          kakao.maps.event.addListener(marker, "click", () => {
            info.open(map, marker);
          });
        }
        if (markers.length > 1) {
          map.setBounds(bounds);
        } else if (markers.length === 1) {
          map.setCenter(new kakao.maps.LatLng(markers[0].lat, markers[0].lng));
        }

        setReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "지도를 불러오지 못했습니다.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [markers, fallbackCenter.lat, fallbackCenter.lng]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#e8f2ec] ${className}`}
    >
      <div
        ref={containerRef}
        className={`block w-full ${heightClassName}`}
        role="img"
        aria-label={ariaLabel}
      />
      {!ready && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#e8f2ec]/60">
          <p className="text-[13px] text-muted">지도 불러오는 중…</p>
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#e8f2ec] px-4 text-center">
          <MapPin className="size-5 text-primary" />
          <p className="text-[13px] text-muted">{error}</p>
          {markers[0] ? (
            <p className="text-[12px] font-medium text-text">{markers[0].name}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
