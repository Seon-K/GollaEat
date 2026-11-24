export function isPersonalizedQuery(query: { queryKey: readonly unknown[] }) {
  return ["menus", "menu", "restaurants", "restaurant", "judgement", "favorites"].includes(String(query.queryKey[1]));
}

/** TanStack Query 키 팩토리 */
export const apiKeys = {
  all: ["gollaeat"] as const,
  session: () => [...apiKeys.all, "session"] as const,
  dietaryCriteria: () => [...apiKeys.all, "dietary-criteria"] as const,
  allergens: () => [...apiKeys.all, "allergens"] as const,
  restrictedIngredients: () =>
    [...apiKeys.all, "restricted-ingredients"] as const,
  menuCategories: () => [...apiKeys.all, "menu-categories"] as const,
  profile: () => [...apiKeys.all, "profile"] as const,
  menus: (params?: Record<string, unknown>) =>
    [...apiKeys.all, "menus", params ?? {}] as const,
  menu: (id: string) => [...apiKeys.all, "menu", id] as const,
  restaurants: (params?: Record<string, unknown>) =>
    [...apiKeys.all, "restaurants", params ?? {}] as const,
  restaurant: (id: string) => [...apiKeys.all, "restaurant", id] as const,
  favorites: () => [...apiKeys.all, "favorites"] as const,
  reviews: (menuId?: string) =>
    [...apiKeys.all, "reviews", menuId ?? "all"] as const,
  myReviews: (page: number) => [...apiKeys.all, "reviews", "mine", page] as const,
  myReports: (page: number) => [...apiKeys.all, "reports", "mine", page] as const,
  judgement: (menuId: string) =>
    [...apiKeys.all, "judgement", menuId] as const,
};
