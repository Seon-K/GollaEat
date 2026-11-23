import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ReviewCard } from "./ReviewCard";
import { MessageSquare } from "lucide-react";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { ApiErrorPanel, ApiLoading } from "./ApiState";
import { Pagination } from "./Pagination";

export function MyReviews({ active = true }: { active?: boolean }) {
  const [page, setPage] = useState(1);
  const reviews = useQuery({ enabled: active, queryKey: apiKeys.myReviews(page), queryFn: () => getDataProvider().getMyReviews(page), placeholderData: keepPreviousData });
  const loading = !reviews.isError && (reviews.isPending || reviews.isFetching || reviews.isPlaceholderData);
  const pagination = reviews.data?.pagination;
  return <div className="space-y-3">
    {loading ? <ApiLoading label="내 리뷰 로딩 중" /> : reviews.isError ? <ApiErrorPanel error={reviews.error} onRetry={() => void reviews.refetch()} /> : !reviews.data?.items.length ?
      <div className="rounded-2xl border border-dashed border-border-strong bg-card px-6 py-12 text-center">
        <MessageSquare className="mx-auto size-8 text-muted" aria-hidden="true" />
        <p className="mt-3 font-semibold">작성한 리뷰가 없습니다</p>
        <p className="mt-1 text-sm text-muted">메뉴 상세에서 주문·방문 경험을 남겨보세요.</p>
      </div> : reviews.data.items.map((review) => <ReviewCard key={review.id} review={review} showMenu onDeleted={() => {
        if (reviews.data?.items.length === 1 && page > 1) setPage(page - 1);
      }} />)}
    {pagination && <Pagination page={page} totalPages={pagination.totalPages} disabled={loading} onChange={setPage} />}
  </div>;
}
