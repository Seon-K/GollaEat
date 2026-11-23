import { LoadingSkeleton, type SkeletonVariant } from "./LoadingSkeleton";
import { ApiError, isRequestCancelled } from "@/lib/api/errors";

export function ApiLoading({ label, variant = "list" }: { label?: string; variant?: SkeletonVariant }) {
  return <LoadingSkeleton variant={variant} label={label} />;
}

export function ApiErrorPanel({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  if (isRequestCancelled(error)) return null;
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "요청에 실패했습니다.";

  return (
    <div className="rounded-2xl border border-[#eef1ef] bg-card px-4 py-6 text-center">
      <p className="text-[14px] text-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-primary-light px-5 text-[14px] font-semibold text-primary touch-target"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
