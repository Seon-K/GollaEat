import { useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { favoriteSync, type FavoritePreview } from "@/lib/api/favoriteSync";

export function useFavorites() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: apiKeys.favorites(),
    queryFn: () => getDataProvider().getFavorites(),
  });
  const sync = favoriteSync(client, getDataProvider);
  useSyncExternalStore(sync.subscribe, sync.snapshot, sync.snapshot);
  return {
    favorites: sync.favorites(query.data ?? []),
    isLoading: query.isPending && !query.isError,
    isError: query.isError && !query.data,
    error: query.error,
    refetch: query.refetch,
    isSaved: (menuId: string, fallback = false) => sync.isSaved(menuId, fallback),
    toggleSave: (menuId: string, preview?: FavoritePreview) => sync.toggle(menuId, preview),
    isSaving: (menuId: string) => sync.isSaving(menuId),
    saveError: sync.error,
  };
}
