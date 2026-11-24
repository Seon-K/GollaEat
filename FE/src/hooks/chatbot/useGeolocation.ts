import { useCallback, useEffect, useRef, useState } from "react";
import { locate, LocationError } from "@/hooks/useGeolocation";
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
  refresh: () => Promise<UserLocation>;
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
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++generation.current;
    setStatus("pending");
    try {
      const point = await locate(navigator.geolocation);
      const current = { ...point, label: "현재 위치", isGps: true };
      if (requestId === generation.current) {
        setLocation(current);
        setStatus("ready");
      }
      return current;
    } catch (error) {
      if (requestId === generation.current) {
        setLocation(FALLBACK);
        setStatus(error instanceof LocationError && error.status === "denied" ? "denied" : "unavailable");
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    return () => { generation.current += 1; };
  }, [refresh]);

  return { location, status, refresh };
}
