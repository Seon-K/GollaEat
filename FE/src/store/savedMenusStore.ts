"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SavedMenusState {
  savedMenuIds: string[];
  toggleSavedMenu: (menuId: string) => void;
  isSaved: (menuId: string) => boolean;
  clearSaved: () => void;
}

export const useSavedMenusStore = create<SavedMenusState>()(
  persist(
    (set, get) => ({
      savedMenuIds: ["mushroom-salad", "janchi-guksu"],
      toggleSavedMenu: (menuId) =>
        set((s) => {
          const unique = [...new Set(s.savedMenuIds)];
          return {
            savedMenuIds: unique.includes(menuId)
              ? unique.filter((id) => id !== menuId)
              : [...unique, menuId],
          };
        }),
      isSaved: (menuId) => get().savedMenuIds.includes(menuId),
      clearSaved: () => set({ savedMenuIds: [] }),
    }),
    {
      name: "gollaeat-saved-menus",
      merge: (persisted, current) => {
        const p = persisted as Partial<SavedMenusState> | undefined;
        const ids = [...new Set(p?.savedMenuIds ?? current.savedMenuIds)];
        return { ...current, ...p, savedMenuIds: ids };
      },
    },
  ),
);
