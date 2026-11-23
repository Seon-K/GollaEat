export type KakaoPoint = { getLat: () => number; getLng: () => number };
export type KakaoMap = {
  setCenter: (latlng: unknown) => void;
  setBounds: (bounds: unknown) => void;
  getCenter: () => KakaoPoint;
  getLevel: () => number;
  getBounds: () => { getSouthWest: () => KakaoPoint; getNorthEast: () => KakaoPoint; contain: (point: unknown) => boolean };
  relayout: () => void;
};
export type KakaoNamespace = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    Map: new (
      container: HTMLElement,
      options: { center: unknown; level: number },
    ) => KakaoMap;
    Marker: new (options: {
      position: unknown;
      map?: unknown;
      title?: string;
      zIndex?: number;
    }) => { setMap: (map: unknown | null) => void };
    CustomOverlay: new (options: { position: unknown; content: HTMLElement; map?: unknown; zIndex?: number; yAnchor?: number }) => { setMap: (map: unknown | null) => void };
    InfoWindow: new (options: { content: string }) => {
      open: (map: unknown, marker: unknown) => void;
      close: () => void;
    };
    LatLngBounds: new () => {
      extend: (latlng: unknown) => void;
    };
    event: {
      addListener: (target: unknown, type: string, handler: () => void) => void;
      removeListener: (target: unknown, type: string, handler: () => void) => void;
    };
  };
};

declare global {
  interface Window {
    kakao?: KakaoNamespace;
  }
}

let loadPromise: Promise<KakaoNamespace> | null = null;

export function getKakaoMapAppKey(): string | null {
  const key = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim();
  return key ? key : null;
}

/** Kakao Maps JS SDK 1회 로드 (autoload=false) */
export function loadKakaoMaps(): Promise<KakaoNamespace> {
  const appKey = getKakaoMapAppKey();
  if (!appKey) {
    return Promise.reject(new Error("VITE_KAKAO_MAP_APP_KEY is not set"));
  }
  if (window.kakao?.maps) {
    return new Promise((resolve) => {
      window.kakao!.maps.load(() => resolve(window.kakao!));
    });
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Kakao Maps SDK timeout")), 15000);
    const fail = (message: string) => { window.clearTimeout(timer); reject(new Error(message)); };
    const existing = document.getElementById("kakao-map-sdk");
    const start = () => {
      if (!window.kakao?.maps) {
        fail("Kakao Maps SDK failed to initialize");
        return;
      }
      window.kakao.maps.load(() => { window.clearTimeout(timer); resolve(window.kakao!); });
    };
    if (existing) {
      existing.addEventListener("load", start);
      existing.addEventListener("error", () =>
        fail("Kakao Maps SDK script error"),
      );
      if (window.kakao?.maps) start();
      return;
    }
    const script = document.createElement("script");
    script.id = "kakao-map-sdk";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.onload = start;
    script.onerror = () => fail("Kakao Maps SDK network error");
    document.head.appendChild(script);
  });

  loadPromise = loadPromise.catch((error) => {
    loadPromise = null;
    document.getElementById("kakao-map-sdk")?.remove();
    throw error;
  });
  return loadPromise;
}
