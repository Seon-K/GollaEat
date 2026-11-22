import { KakaoMapView } from "@/components/KakaoMapView";

interface StoreMapProps {
  storeName: string;
  lat: number | null;
  lng: number | null;
}

/** 메뉴 상세 — 카카오맵 단일 매장 위치 */
export function StoreMap({ storeName, lat, lng }: StoreMapProps) {
  const markers =
    typeof lat === "number" && typeof lng === "number"
      ? [{ id: storeName, name: storeName, lat, lng }]
      : [];

  return (
    <KakaoMapView
      markers={markers}
      fallbackCenter={
        typeof lat === "number" && typeof lng === "number"
          ? { lat, lng }
          : undefined
      }
      heightClassName="h-36"
      ariaLabel={`${storeName} 위치 지도`}
    />
  );
}
