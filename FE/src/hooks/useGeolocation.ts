import { useCallback, useEffect, useRef, useState } from "react";

export type GeoPoint = { lat: number; lng: number };
type GeoFailure = "denied" | "timeout" | "error" | "unsupported";
type GeoStatus = "idle" | "loading" | "success" | GeoFailure;
let lastFix: { point: GeoPoint; at: number } | null = null;
let pendingFix: Promise<GeoPoint> | null = null;
const freshFix = () => lastFix && Date.now() - lastFix.at < 60_000 ? lastFix.point : null;

export class LocationError extends Error {
  constructor(public status: GeoFailure) { super(status); }
}

export function locate(geolocation?: Pick<Geolocation, "getCurrentPosition">): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new LocationError("unsupported")); return; }
    geolocation.getCurrentPosition(({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      (error) => reject(new LocationError(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "error")),
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false });
  });
}

export function useGeolocation({ autoRequest = false } = {}) {
  const [status, setStatus] = useState<GeoStatus>(() => freshFix() ? "success" : "idle");
  const [position, setPosition] = useState<GeoPoint | null>(freshFix);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const request = useCallback(() => {
    const id = ++generation.current;
    setStatus("loading");
    pendingFix ??= locate(navigator.geolocation).then((point) => {
      lastFix = { point, at: Date.now() };
      return point;
    }).finally(() => { pendingFix = null; });
    void pendingFix.then((point) => {
      if (id !== generation.current) return;
      setPosition(point);
      setStatus("success");
    }).catch((error: unknown) => {
      if (id !== generation.current) return;
      setStatus(error instanceof LocationError ? error.status : "error");
    });
  }, []);
  useEffect(() => { if (autoRequest && !freshFix()) request(); }, [autoRequest, request]);
  return { status, position, request };
}
