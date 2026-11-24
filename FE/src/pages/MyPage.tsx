import { MyReviews } from "@/components/MyReviews";
import { MyReports } from "@/components/MyReports";
import { Toast } from "@/components/Toast";
import { Link, useSearchParams } from "react-router-dom";

import { Bookmark, ChevronRight } from "lucide-react";
import { ApiErrorPanel, ApiLoading } from "@/components/ApiState";
import { BottomNav } from "@/components/BottomNav";
import { Chip } from "@/components/Chip";
import { MenuCard, type MenuCardModel } from "@/components/MenuCard";
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { useFavorites } from "@/hooks/useFavoriteToggle";
import { mapServerStatus } from "@/lib/api/adapters";
import { useProfileStore } from "@/store/profileStore";

const ACTIVITY_TABS = [
  { id: "saved", label: "저장 메뉴" },
  { id: "reviews", label: "내 리뷰" },
  { id: "reports", label: "내 제보" },
] as const;
type ActivityTab = (typeof ACTIVITY_TABS)[number]["id"];

export default function MyPage() {
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);
  const fav = useFavorites();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: ActivityTab = requestedTab === "reviews" || requestedTab === "reports" ? requestedTab : "saved";
  const setTab = (next: ActivityTab) => setSearchParams(next === "saved" ? {} : { tab: next }, { replace: true });

  const savedCards: MenuCardModel[] = fav.favorites.map((f) => {
    const status = f.judgement
      ? mapServerStatus(f.judgement.status)
      : ("check" as const);
    return {
      id: f.menu_id,
      name: f.menu?.menu_name ?? f.menu?.name ?? f.menu_id,
      restaurantName: f.menu?.restaurant?.restaurant_name ?? "",
      priceAmount: f.menu?.price?.amount ?? 0,
      distanceKm: null,
      status,
      saved: fav.isSaved(f.menu_id),
    };
  });

  return (
    <main className="min-h-[100dvh] bg-background pb-24">
      <div className="px-5 pt-6">
        <h1 className="text-[26px] font-bold text-text">마이페이지</h1>

        <section className="mt-6 rounded-2xl border border-[#eef1ef] bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-bold text-text">내 식이 프로필</h2>
            <Link
              to="/setup/allergen?from=my"
              className="touch-target inline-flex items-center gap-0.5 text-[13px] font-medium text-primary"
            >
              프로필 수정
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <p className="mt-4 text-[13px] text-muted">알레르겐</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {allergens.length === 0 ? (
              <span className="text-[13px] text-muted">없음</span>
            ) : (
              allergens.map((a) => (
                <Chip key={a} label={allergenLabel(a)} variant="readonly" />
              ))
            )}
          </div>

          <p className="mt-4 text-[13px] text-muted">제한 재료</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {restrictions.length === 0 ? (
              <span className="text-[13px] text-muted">없음</span>
            ) : (
              restrictions.map((r) => (
                <Chip
                  key={r}
                  label={restrictionLabel(r)}
                  variant="readonly"
                />
              ))
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-[16px] font-bold text-text">내 활동</h2>
          <div className="mt-3 flex gap-2" role="tablist" aria-label="내 활동">
            {ACTIVITY_TABS.map(({ id, label }, index) =>
              <button key={id} id={`my-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`my-panel-${id}`}
                tabIndex={tab === id ? 0 : -1} onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? ACTIVITY_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + ACTIVITY_TABS.length) % ACTIVITY_TABS.length;
                  const next = ACTIVITY_TABS[nextIndex].id;
                  setTab(next); document.getElementById(`my-tab-${next}`)?.focus();
                }} onClick={() => setTab(id)} className={`inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold ${tab === id ? "bg-primary text-white" : "border border-border-strong bg-card text-muted"}`}>{label}</button>)}
          </div>
          <div role="tabpanel" id="my-panel-reviews" aria-labelledby="my-tab-reviews" hidden={tab !== "reviews"} className="mt-4">
            <MyReviews active={tab === "reviews"} />
          </div>
          <div role="tabpanel" id="my-panel-reports" aria-labelledby="my-tab-reports" hidden={tab !== "reports"} className="mt-4">
            <MyReports active={tab === "reports"} />
          </div>
          <div role="tabpanel" id="my-panel-saved" aria-labelledby="my-tab-saved" hidden={tab !== "saved"} className="mt-4 space-y-3">
            {fav.isLoading ? <ApiLoading /> : null}
            {fav.isError ? (
              <ApiErrorPanel
                error={fav.error}
                onRetry={() => void fav.refetch()}
              />
            ) : null}
            {!fav.isLoading && !fav.isError && savedCards.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#d5dad7] bg-card/60 px-6 py-12 text-center">
                <Bookmark className="size-8 text-muted" strokeWidth={1.5} />
                <p className="mt-3 text-[15px] font-semibold text-text">
                  저장한 메뉴가 없습니다
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  탐색에서 북마크로 메뉴를 저장해 보세요.
                </p>
                <Link
                  to="/explore"
                  className="mt-5 inline-flex h-11 items-center rounded-full bg-primary-light px-5 text-[14px] font-semibold text-primary"
                >
                  메뉴 탐색하기
                </Link>
              </div>
            ) : null}
            {!fav.isLoading && !fav.isError && savedCards.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                variant="saved"
                onToggleSave={() => void fav.toggleSave(item.id, item)}
                saving={fav.isSaving(item.id)}
              />
            ))}
          </div>
        </section>
      </div>
      <Toast message={fav.saveError ?? ""} visible={!!fav.saveError} /><BottomNav />
    </main>
  );
}
