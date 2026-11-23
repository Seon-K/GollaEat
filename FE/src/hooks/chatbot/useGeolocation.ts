import { useCallback, useEffect, useState } from "react";
import { ASAN_ORIGIN } from "@/data/mock";

export type GeoStatus = "pending" | "ready" | "denied" | "unavailable";

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
  /** GPS로 받은 실제 현재 위치인지 */
  isGps: boolean;
}

interface UseGeolocationResult {
  location: UserLocation;
  status: GeoStatus;
  refresh: () => void;
}

const FALLBACK: UserLocation = {
  lat: ASAN_ORIGIN.lat,
  lng: ASAN_ORIGIN.lng,
  label: ASAN_ORIGIN.label ?? "충남 아산시",
  isGps: false,
};

/**
 * 브라우저 Geolocation → 실패 시 아산 폴백.
 * 탐색/거리 API 기준점으로 사용.
 */
export function useGeolocation(): UseGeolocationResult {
  const [location, setLocation] = useState<UserLocation>(FALLBACK);
  const [status, setStatus] = useState<GeoStatus>("pending");
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocation(FALLBACK);
      setStatus("unavailable");
      return;
    }

    setStatus("pending");
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "현재 위치",
          isGps: true,
        });
        setStatus("ready");
      },
      () => {
        if (cancelled) return;
        setLocation(FALLBACK);
        setStatus("denied");
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 60_000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { location, status, refresh };
}
