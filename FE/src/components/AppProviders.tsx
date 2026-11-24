import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useProfileStore } from "@/store/profileStore";
import { makeQueryClient } from "@/lib/api/queryClient";
import { isPersonalizedQuery } from "@/lib/api/keys";
import { profileSignature } from "@/lib/api/homeMenus";
import { useDiscoveryFilters } from "@/hooks/useDiscovery";

/** TanStack Query + 세션 부트 — 시각 디자인 토큰 변경 없음 */
export function ProfileCacheSync() {
  const client = useQueryClient();
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);
  const signature = profileSignature(allergens, restrictions);
  const previous = useRef(signature);
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    useDiscoveryFilters.getState().setHomePage(1, "");
    void client.invalidateQueries({ predicate: isPersonalizedQuery });
  }, [client, signature]);
  return null;
}
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
