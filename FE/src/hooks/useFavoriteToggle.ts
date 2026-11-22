import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";

/** 즐겨찾기 목록 + 토글 (서버 favorite id 기준) */
export function useFavorites() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: apiKeys.favorites(),
    queryFn: () => getDataProvider().getFavorites(),
  });

  const byMenuId = new Map(
    (query.data ?? []).map((f) => [f.menu_id, f] as const),
  );

  const toggle = useMutation({
    mutationFn: async (menuId: string) => {
      const existing = byMenuId.get(menuId);
      if (existing) {
        await getDataProvider().removeFavorite(existing.id);
        return { action: "removed" as const, menuId };
      }
      const created = await getDataProvider().addFavorite(menuId);
      return { action: "added" as const, menuId, id: created.id };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: apiKeys.favorites() });
    },
  });

  return {
    favorites: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isSaved: (menuId: string) => byMenuId.has(menuId),
    toggleSave: (menuId: string) => toggle.mutateAsync(menuId),
    toggling: toggle.isPending,
  };
}
