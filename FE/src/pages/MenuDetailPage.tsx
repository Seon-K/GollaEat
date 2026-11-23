import { ReviewCard } from "@/components/ReviewCard";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { ApiErrorPanel, ApiLoading } from "@/components/ApiState";
import { Chip } from "@/components/Chip";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusBadge } from "@/components/StatusBadge";
import { StoreMap } from "@/components/StoreMap";
import { allergenLabel } from "@/data/allergens";
import { useFavorites } from "@/hooks/useFavoriteToggle";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { formatPrice } from "@/lib/geo";
import { VERDICT_COPY } from "@/lib/verdictCopy";
import { useProfileStore } from "@/store/profileStore";

function MenuDetailContent() {
  const params = useParams();
  const id = String(params.id ?? "");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const backHref = searchParams.get("from") === "my" ? "/my" : "/explore";
  const qc = useQueryClient();
  const allergens = useProfileStore((s) => s.allergens);
  const fav = useFavorites();
  const [reviewText, setReviewText] = useState("");

  const menuQuery = useQuery({
    queryKey: apiKeys.menu(id),
    queryFn: () => getDataProvider().getMenu(id),
  });

  const judgementQuery = useQuery({
    queryKey: apiKeys.judgement(id),
    queryFn: () => getDataProvider().postJudgement(id),
  });

  const reviewsQuery = useQuery({
    queryKey: apiKeys.reviews(id),
    queryFn: () => getDataProvider().getReviews(id),
  });

  const createReview = useMutation({
    mutationFn: (body: string) =>
      getDataProvider().createReview({
        menuId: id,
        body,
        discloseConditions: [],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: apiKeys.reviews().slice(0, 2) });
      setReviewText("");
    },
  });

  const menu = menuQuery.data;
  const judgement = judgementQuery.data;
  const reviewTag = allergens[0]
    ? `${allergenLabel(allergens[0])} 제한`
    : "내 조건";

  const restrictedHits = useMemo(() => {
    if (!judgement) return [];
    return judgement.reasons
      .filter((r) => r.status === "mismatch")
      .map((r) => r.label);
  }, [judgement]);

  const unknownBits = useMemo(() => {
    if (!judgement) return [];
    const fromReasons = judgement.reasons.flatMap((r) => r.unknownItems);
    return [...new Set([...judgement.unknownItems, ...fromReasons])];
  }, [judgement]);

  if (menuQuery.isLoading || judgementQuery.isLoading) {
    return (
      <main className="min-h-[100dvh] bg-background px-5 pt-6">
        <ApiLoading />
      </main>
    );
  }

  if (menuQuery.isError || !menu) {
    return (
      <main className="p-6">
        <ApiErrorPanel
          error={menuQuery.error ?? new Error("메뉴를 찾을 수 없습니다.")}
          onRetry={() => void menuQuery.refetch()}
        />
        <Link to="/explore" className="mt-4 inline-block text-primary">
          탐색으로
        </Link>
      </main>
    );
  }

  if (judgementQuery.isError || !judgement) {
    return (
      <main className="p-6">
        <ApiErrorPanel
          error={judgementQuery.error}
          onRetry={() => void judgementQuery.refetch()}
        />
      </main>
    );
  }

  const copy = VERDICT_COPY[judgement.status];
  const panelDescription =
    judgement.status === "check" && unknownBits.length > 0
      ? "재료 정보 없음 · 매장 확인 필요"
      : copy.description;

  const mapUrl =
    typeof menu.lat === "number" && typeof menu.lng === "number"
      ? `https://map.kakao.com/link/map/${encodeURIComponent(menu.restaurantName)},${menu.lat},${menu.lng}`
      : `https://map.kakao.com/link/search/${encodeURIComponent(menu.restaurantName)}`;

  const saved = fav.isSaved(menu.id);

  return (
    <main className="min-h-[100dvh] bg-background pb-40">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-background/95 px-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(backHref)}
          className="touch-target inline-flex items-center gap-1 text-[15px] font-bold text-text"
          aria-label="뒤로"
        >
          <ChevronLeft className="size-5 text-primary" />
          메뉴 상세
        </button>
        <button
          type="button"
          onClick={() => void fav.toggleSave(menu.id)}
          className="touch-target inline-flex items-center justify-center text-primary"
          aria-label="저장"
          aria-busy={fav.isSaving(menu.id)}
        >
          <Bookmark className="size-5" fill={saved ? "currentColor" : "none"} />
        </button>
      </header>

      <div className="space-y-4 px-5">
        <section className="rounded-2xl border border-[#eef1ef] bg-card p-4">
          <h1 className="text-[22px] font-bold text-text">{menu.name}</h1>
          <p className="mt-1 text-[14px] text-muted">{menu.restaurantName}</p>
          <p className="mt-2 text-[18px] font-bold text-text">
            {formatPrice(menu.priceAmount)}
          </p>
        </section>

        <StatusBadge
          status={judgement.status}
          variant="panel"
          description={panelDescription}
          note="교차접촉 및 조리 과정은 판단 범위에서 제외"
        />

        <section className="rounded-2xl border border-[#eef1ef] bg-card p-4">
          <h2 className="text-[15px] font-bold text-text">재료 · 알레르겐 정보</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-text">
            <span className="text-muted">확인 재료: </span>
            확인된 정보 기준
          </p>
          {restrictedHits.length > 0 ? (
            <p className="mt-2 text-[14px] font-bold text-error">
              확인된 제한 성분: {restrictedHits.join(", ")}
            </p>
          ) : (
            <p className="mt-2 text-[14px] font-bold text-primary">
              확인된 제한 성분 없음
            </p>
          )}
          {unknownBits.length > 0 ? (
            <p className="mt-2 text-[13px] text-accent-text">
              미확인: {unknownBits.join(" · ")}
            </p>
          ) : null}
          {judgement.unknownMessages.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {judgement.unknownMessages.slice(0, 3).map((msg) => (
                <li key={msg} className="text-[13px] text-muted">
                  {msg}
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            to={`/menu/${menu.id}/reasoning`}
            className="mt-3 flex items-center justify-between text-[14px] font-medium text-primary touch-target"
          >
            판단 근거 자세히 보기
            <ChevronRight className="size-4" />
          </Link>
        </section>

        <section className="rounded-2xl border border-[#eef1ef] bg-card p-4">
          <h2 className="text-[15px] font-bold text-text">메뉴 정보 · 매장 안내</h2>
          <p className="mt-3 text-[13px] text-muted">
            확인된 재료 정보 기준 · 매장별 실제 재료와 차이가 있을 수 있습니다.
          </p>
          <Link
            to={`/menu/${menu.id}/report`}
            className="mt-3 flex items-center justify-between text-[14px] font-medium text-primary touch-target"
          >
            정보 오류 신고하기
            <ChevronRight className="size-4" />
          </Link>
        </section>

        <section>
          <h2 className="mb-3 text-[15px] font-bold text-text">매장 위치</h2>
          <StoreMap
            storeName={menu.restaurantName}
            lat={menu.lat}
            lng={menu.lng}
          />
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-border-strong bg-card px-4 py-3.5 text-[14px] font-semibold text-primary touch-target"
          >
            길찾기
            <ChevronRight className="size-4" aria-hidden />
          </a>
        </section>

        <section>
          <h2 className="text-[15px] font-bold text-text">식이 조건별 리뷰</h2>
          <p className="mt-1 text-[12px] text-muted">
            실제 주문·방문 경험 · 이용자 작성 정보
          </p>
          {reviewsQuery.isLoading ? <ApiLoading label="리뷰 불러오는 중" /> : null}
          {reviewsQuery.isError ? (
            <ApiErrorPanel
              error={reviewsQuery.error}
              onRetry={() => void reviewsQuery.refetch()}
            />
          ) : null}
          <div className="mt-3 space-y-3">
            {(reviewsQuery.data ?? []).map((review) => <ReviewCard key={review.id} review={review} fallbackLabel={reviewTag} />)}
          </div>
        </section>

        <section className="rounded-2xl border border-[#eef1ef] bg-card p-4">
          <h2 className="mb-3 text-[15px] font-bold text-text">내 리뷰 작성</h2>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="방문 경험과 확인 내용을 입력해 주세요."
            className="min-h-24 w-full resize-none rounded-xl border border-border-strong bg-card p-3 text-[14px]"
            aria-label="리뷰 내용"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={!reviewText.trim() || createReview.isPending}
              onClick={() => createReview.mutate(reviewText.trim())}
              className="h-10 rounded-full bg-primary-light px-4 text-[13px] font-semibold text-primary disabled:opacity-40 touch-target"
            >
              등록하기
            </button>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-phone -translate-x-1/2 bg-background/95 px-5 pt-2 backdrop-blur safe-bottom">
        <div className="mb-2 flex justify-end">
          <Link
            to={`/show-staff?menuId=${menu.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-dark px-4 text-[13px] font-semibold text-white"
          >
            <Eye className="size-4" />
            직원에게 보여주기
          </Link>
        </div>
        <PrimaryButton onClick={() => navigate(`/menu/${menu.id}/inquiry`)}>
          매장에 문의하기
        </PrimaryButton>
      </div>
    </main>
  );
}


export default MenuDetailContent;
