import { apiKeys } from "@/lib/api/keys";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getBootstrapProfile, onSessionIdentityChange } from "@/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { getDataMode, getDataProvider } from "@/lib/api/providers";
import { useProfileStore } from "@/store/profileStore";
import { ApiError } from "@/lib/api/errors";

/**
 * 앱 기동 시 세션 1회 초기화 + 서버 프로필 hydrate (api 모드).
 * mock 모드는 네트워크 없이 통과.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const bootVersion = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hydrateFromApi = useProfileStore((s) => s.hydrateFromApi);

  const boot = useCallback(async () => {
    const version = ++bootVersion.current;
    setError(null);
    try {
      if (getDataMode() === "mock") {
        setReady(true);
        return;
      }
      const profile = await queryClient.fetchQuery({
        queryKey: apiKeys.profile(),
        queryFn: async () => (await getBootstrapProfile()) ?? getDataProvider().getProfile(),
        staleTime: 0, retry: false,
      });
      if (version !== bootVersion.current) return;
      hydrateFromApi(profile);
      setReady(true);
    } catch (e) {
      if (version !== bootVersion.current) return;
      setReady(false);
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "세션을 시작하지 못했습니다.",
      );
    }
  }, [hydrateFromApi, queryClient]);

  useEffect(() => {
    void boot();
  }, [boot, attempt]);

  useEffect(() => onSessionIdentityChange(() => {
    bootVersion.current++;
    setReady(false);
    void queryClient.cancelQueries().then(() => {
      queryClient.clear();
      setAttempt((value) => value + 1);
    });
  }), [queryClient]);

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
      <main className="min-h-[100dvh] bg-background px-5 pb-24 pt-6">
        <LoadingSkeleton variant="page" />
      </main>
    );
  }

  return children;
}
