import { useEffect, useState } from "react";
import { create } from "zustand";
import { CATEGORY_FILTER_LABEL } from "@/lib/api/criteriaMap";
import type { CategoryFilter } from "@/types";

export interface DiscoveryFilters { query: string; category: CategoryFilter; status: "all" | "match" | "check" | "mismatch"; sort: string }
const defaults: DiscoveryFilters = { query: "", category: "all", status: "all", sort: "dietary" };
interface SearchState {
  home: DiscoveryFilters; map: DiscoveryFilters;
  homePage: number; homePageScope: string;
  setHomePage: (page: number, scope: string) => void;
  update: (scope: "home" | "map", values: Partial<DiscoveryFilters>) => void;
}
export const useDiscoveryFilters = create<SearchState>((set) => ({
  home: { ...defaults }, map: { ...defaults },
  homePage: 1, homePageScope: "",
  setHomePage: (homePage, homePageScope) => set({ homePage, homePageScope }),
  update: (scope, values) => set((state) => {
    if (!Object.entries(values).some(([key, value]) => state[scope][key as keyof DiscoveryFilters] !== value)) return state;
    return { [scope]: { ...state[scope], ...values }, ...(scope === "home" ? { homePage: 1, homePageScope: "" } : {}) };
  }),
}));
export function filterParams(filters: DiscoveryFilters, query: string) {
  return { q: query.trim() || undefined,
    category: filters.category === "all" ? undefined : CATEGORY_FILTER_LABEL[filters.category],
    judgement_status: filters.status === "all" ? undefined : filters.status === "check" ? "needs_check" as const : filters.status, sort: filters.sort };
}
export function useDebounced<T>(value: T, delay = 350) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setResult(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return result;
}
