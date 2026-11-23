import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/api/queryClient";

/** TanStack Query + 세션 부트 — 시각 디자인 토큰 변경 없음 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
