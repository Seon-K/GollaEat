import { KakaoMapView, type MapMarker } from "@/components/KakaoMapView";

interface NearbyMapProps {
  markers: MapMarker[];
  center: { lat: number; lng: number };
}

/** 탐색 화면 — 카카오맵에 주변 매장 마커 표시 */
export function NearbyMap({ markers, center }: NearbyMapProps) {
  return (
    <KakaoMapView
      markers={markers}
      fallbackCenter={center}
      heightClassName="h-40"
      ariaLabel="주변 매장 지도"
    />
  );
}
