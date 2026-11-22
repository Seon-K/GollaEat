type KakaoNamespace = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    Map: new (
      container: HTMLElement,
      options: { center: unknown; level: number },
    ) => {
      setCenter: (latlng: unknown) => void;
      setBounds: (bounds: unknown) => void;
    };
    Marker: new (options: {
      position: unknown;
      map?: unknown;
      title?: string;
    }) => { setMap: (map: unknown | null) => void };
    InfoWindow: new (options: { content: string }) => {
      open: (map: unknown, marker: unknown) => void;
      close: () => void;
    };
    LatLngBounds: new () => {
      extend: (latlng: unknown) => void;
    };
    event: {
      addListener: (target: unknown, type: string, handler: () => void) => void;
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
    const existing = document.getElementById("kakao-map-sdk");
    const start = () => {
      if (!window.kakao?.maps) {
        reject(new Error("Kakao Maps SDK failed to initialize"));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao!));
    };
    if (existing) {
      existing.addEventListener("load", start);
      existing.addEventListener("error", () =>
        reject(new Error("Kakao Maps SDK script error")),
      );
      if (window.kakao?.maps) start();
      return;
    }
    const script = document.createElement("script");
    script.id = "kakao-map-sdk";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.onload = start;
    script.onerror = () => reject(new Error("Kakao Maps SDK network error"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
