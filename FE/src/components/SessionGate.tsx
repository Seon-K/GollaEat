import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiKeys } from "@/lib/api/keys";
import { ensureSession } from "@/lib/api/client";
import { getDataMode, getDataProvider } from "@/lib/api/providers";
import { useProfileStore } from "@/store/profileStore";
import { ApiError } from "@/lib/api/errors";

const SessionState = createContext<{ ready: boolean; error: string | null; retry: () => void }>({
  ready: false, error: null, retry: () => {},
});
export const useSessionState = () => useContext(SessionState);

/**
 * 앱 기동 시 세션 1회 초기화 + 서버 프로필 hydrate (api 모드).
 * mock 모드는 네트워크 없이 통과.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hydrateFromApi = useProfileStore((s) => s.hydrateFromApi);
  const qc = useQueryClient();
  const { pathname } = useLocation();

  const boot = useCallback(async () => {
    setError(null);
    try {
      if (getDataMode() === "mock") {
        setReady(true);
        return;
      }
      await ensureSession();
      const profile = await qc.fetchQuery({ queryKey: apiKeys.profile(),
        queryFn: ({ signal }) => getDataProvider().getProfile({ signal }), retry: false });
      hydrateFromApi(profile);
      setReady(true);
    } catch (e) {
      setReady(false);
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "세션을 시작하지 못했습니다.",
      );
    }
  }, [hydrateFromApi, qc]);

  useEffect(() => {
    void boot();
  }, [boot, attempt]);

  const state = { ready, error, retry: () => setAttempt((n) => n + 1) };
  // Only the non-personalized introduction can render before server hydration.
  if (pathname === "/") return <SessionState.Provider value={state}>{children}</SessionState.Provider>;

  if (error) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
        <p className="text-[15px] font-semibold text-text">연결에 실패했습니다</p>
        <p className="mt-2 text-[14px] text-muted">{error}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-6 inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-white touch-target"
        >
          다시 시도
        </button>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background">
        <p className="text-[14px] text-muted">준비 중…</p>
      </main>
    );
  }

  return <SessionState.Provider value={state}>{children}</SessionState.Provider>;
}
