import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError, isRequestCancelled } from "@/lib/api/errors";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => count < 1 && !isRequestCancelled(error)
          && !(error instanceof ApiRequestError && error.kind === "timeout"),
        refetchOnWindowFocus: false,
      },
    },
  });
}
