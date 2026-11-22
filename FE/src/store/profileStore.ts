import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEMO_PROFILE } from "@/data/mock";
import { criteriaCodesToProfile } from "@/lib/api/criteriaMap";
import type { ApiProfile } from "@/lib/api/types";
import type { AllergenId, DietProfile, RestrictionId } from "@/types";

interface ProfileState extends DietProfile {
  completed: boolean;
  toggleAllergen: (id: AllergenId) => void;
  setAllergens: (ids: AllergenId[]) => void;
  toggleRestriction: (id: RestrictionId) => void;
  setRestrictions: (ids: RestrictionId[]) => void;
  saveProfile: () => void;
  getProfile: () => DietProfile;
  /** 서버 GET /api/profile 결과로 hydrate */
  hydrateFromApi: (profile: ApiProfile) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      allergens: [...DEMO_PROFILE.allergens],
      restrictions: [...DEMO_PROFILE.restrictions],
      completed: false,
      toggleAllergen: (id) =>
        set((s) => ({
          allergens: s.allergens.includes(id)
            ? s.allergens.filter((a) => a !== id)
            : [...s.allergens, id],
        })),
      setAllergens: (ids) => set({ allergens: ids }),
      toggleRestriction: (id) =>
        set((s) => ({
          restrictions: s.restrictions.includes(id)
            ? s.restrictions.filter((r) => r !== id)
            : [...s.restrictions, id],
        })),
      setRestrictions: (ids) => set({ restrictions: ids }),
      saveProfile: () => set({ completed: true }),
      getProfile: () => ({
        allergens: get().allergens,
        restrictions: get().restrictions,
      }),
      hydrateFromApi: (profile) => {
        const mapped = criteriaCodesToProfile(profile.criteria ?? []);
        set({
          allergens: mapped.allergens,
          restrictions: mapped.restrictions,
          completed: Boolean(profile.setup_completed),
        });
      },
    }),
    {
      name: "gollaeat-profile",
      partialize: (state) => ({
        allergens: state.allergens,
        restrictions: state.restrictions,
        completed: state.completed,
      }),
    },
  ),
);
