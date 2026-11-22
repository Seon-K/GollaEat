import { INITIAL_REVIEWS } from "@/data/mock";
import type { Review } from "@/types";

export const REVIEWS = INITIAL_REVIEWS;

export const getReviewsByMenu = (menuId: string): Review[] =>
  INITIAL_REVIEWS.filter((r) => r.menuId === menuId);
