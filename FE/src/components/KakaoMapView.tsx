import { LoadingSkeleton } from "./LoadingSkeleton";
import { useEffect, useRef, useState } from "react";
import { getKakaoMapAppKey, loadKakaoMaps, type KakaoMap } from "@/lib/kakaoMap";
import type { GeoPoint } from "@/hooks/useGeolocation";

export interface MapMarker { id: string; name: string; lat: number; lng: number }
export interface MapViewport { center: GeoPoint; level: number; bounds: string }
interface KakaoMapViewProps {
  markers: MapMarker[];
  fallbackCenter?: GeoPoint;
  className?: string;
  heightClassName?: string;
  ariaLabel?: string;
  interactive?: boolean;
  initialLevel?: number;
  onViewportChange?: (viewport: MapViewport) => void;
  onMarkerSelect?: (id: string) => void;
  selectedId?: string | null;
  currentPosition?: GeoPoint | null;
  moveTo?: GeoPoint | null;
}
const DEFAULT_CENTER = { lat: 36.7898, lng: 127.0017 };
export function KakaoMapView({ markers, fallbackCenter = DEFAULT_CENTER, className = "", heightClassName = "h-40",
  ariaLabel = "지도", interactive = false, initialLevel = 5, onViewportChange, onMarkerSelect,
  selectedId, currentPosition, moveTo }: KakaoMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const callbacks = useRef({ onViewportChange, onMarkerSelect });
  const initial = useRef({ markers, fallbackCenter, initialLevel, interactive });
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { callbacks.current = { onViewportChange, onMarkerSelect }; }, [onViewportChange, onMarkerSelect]);
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    if (!getKakaoMapAppKey()) return;
    void loadKakaoMaps().then((kakao) => {
      if (cancelled || !containerRef.current) return;
      const options = initial.current;
      const center = options.interactive ? options.fallbackCenter : options.markers[0] ?? options.fallbackCenter;
      const map = new kakao.maps.Map(containerRef.current, { center: new kakao.maps.LatLng(center.lat, center.lng), level: options.initialLevel });
      mapRef.current = map;
      const report = () => {
        const bounds = map.getBounds(), sw = bounds.getSouthWest(), ne = bounds.getNorthEast(), c = map.getCenter();
        callbacks.current.onViewportChange?.({ center: { lat: c.getLat(), lng: c.getLng() }, level: map.getLevel(),
          bounds: [sw.getLng(), sw.getLat(), ne.getLng(), ne.getLat()].join(",") });
      };
      kakao.maps.event.addListener(map, "idle", report);
      const observer = new ResizeObserver(() => { map.relayout(); report(); });
      observer.observe(containerRef.current);
      cleanup = () => { observer.disconnect(); kakao.maps.event.removeListener(map, "idle", report); };
      setReady(true);
      report();
    }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "지도를 불러오지 못했습니다."); });
    return () => { cancelled = true; cleanup(); mapRef.current = null; };
  }, [attempt]);
  useEffect(() => {
    const map = mapRef.current, kakao = window.kakao;
    if (!ready || !map || !kakao) return;
    const cleanup: (() => void)[] = [];
    const bounds = new kakao.maps.LatLngBounds();
    for (const m of markers) {
      const position = new kakao.maps.LatLng(m.lat, m.lng);
      bounds.extend(position);
      if (interactive) {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = m.name;
        button.setAttribute("aria-label", `${m.name} 선택`);
        button.setAttribute("aria-pressed", String(m.id === selectedId));
        button.style.cssText = `padding:8px 10px;border-radius:18px;border:2px solid #26744c;background:${m.id === selectedId ? "#26744c" : "white"};color:${m.id === selectedId ? "white" : "#26744c"};font-size:12px;white-space:nowrap;box-shadow:0 2px 6px #0002;`;
        const click = () => callbacks.current.onMarkerSelect?.(m.id);
        button.addEventListener("click", click);
        const overlay = new kakao.maps.CustomOverlay({ position, content: button, map, zIndex: m.id === selectedId ? 5 : 2, yAnchor: 1 });
        cleanup.push(() => { button.removeEventListener("click", click); overlay.setMap(null); });
      } else {
        const marker = new kakao.maps.Marker({ position, map, title: m.name });
        const content = document.createElement("div"); content.textContent = m.name; content.style.cssText = "padding:6px 10px;font-size:12px;white-space:nowrap";
        const info = new kakao.maps.InfoWindow({ content: content.outerHTML });
        const click = () => info.open(map, marker);
        kakao.maps.event.addListener(marker, "click", click);
        cleanup.push(() => { kakao.maps.event.removeListener(marker, "click", click); info.close(); marker.setMap(null); });
      }
    }
    if (!interactive) {
      if (markers.length > 1) map.setBounds(bounds);
      else { const c = markers[0] ?? { lat: fallbackCenter.lat, lng: fallbackCenter.lng }; map.setCenter(new kakao.maps.LatLng(c.lat, c.lng)); }
    }
    return () => cleanup.forEach((fn) => fn());
  }, [ready, attempt, markers, selectedId, interactive, fallbackCenter.lat, fallbackCenter.lng]);
  useEffect(() => {
    if (!ready || !mapRef.current || !window.kakao || !currentPosition) return;
    const dot = document.createElement("div"); dot.textContent = "내 위치";
    dot.style.cssText = "background:#2563eb;color:white;border:3px solid white;border-radius:20px;padding:5px;font-size:11px";
    const overlay = new window.kakao.maps.CustomOverlay({ position: new window.kakao.maps.LatLng(currentPosition.lat, currentPosition.lng), content: dot, map: mapRef.current, zIndex: 6 });
    return () => overlay.setMap(null);
  }, [ready, attempt, currentPosition]);
  useEffect(() => {
    if (ready && moveTo && mapRef.current && window.kakao) mapRef.current.setCenter(new window.kakao.maps.LatLng(moveTo.lat, moveTo.lng));
  }, [ready, moveTo]);
  const missing = !getKakaoMapAppKey();
  return <div className={`relative overflow-hidden rounded-2xl bg-[#e8f2ec] ${className}`}>
    <div ref={containerRef} className={`block w-full ${heightClassName}`} role="region" aria-label={ariaLabel} />
    {!ready && !error && !missing && <div className="absolute inset-0"><LoadingSkeleton variant="map" /></div>}
    {(error || missing) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm">
      <p>{missing ? "지도 연결 설정이 필요합니다. 아래 식당 목록에서 탐색할 수 있습니다." : "지도를 불러오지 못했습니다. 아래 목록을 이용해주세요."}</p>
      {!missing && <button type="button" className="rounded-xl bg-card px-4 py-2" onClick={() => { setError(null); setReady(false); setAttempt((n) => n + 1); }}>지도 다시 시도</button>}
    </div>}
  </div>;
}
