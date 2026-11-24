import { create } from "zustand";
import { persist } from "zustand/middleware";
import { INITIAL_REVIEWS } from "@/data/mock";
import type { Review } from "@/types";

interface ReviewState {
  reviews: Review[];
  addReview: (
    review: Omit<Review, "id" | "createdAt"> & { createdAt?: string },
  ) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      reviews: INITIAL_REVIEWS,
      addReview: (review) =>
        set((s) => ({
          reviews: [
            {
              ...review,
              id: `review-${Date.now()}`,
              createdAt:
                review.createdAt ?? new Date().toISOString().slice(0, 10),
            },
            ...s.reviews,
          ],
        })),
    }),
    { name: "gollaeat-reviews" },
  ),
);
