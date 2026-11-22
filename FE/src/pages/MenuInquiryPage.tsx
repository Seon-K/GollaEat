import { useParams, useNavigate } from "react-router-dom";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Copy, Phone } from "lucide-react";
import { ApiErrorPanel, ApiLoading } from "@/components/ApiState";
import { BottomSheet } from "@/components/BottomSheet";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Toast } from "@/components/Toast";
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { navigateBack } from "@/lib/navBack";
import { useProfileStore } from "@/store/profileStore";

const MOCK_TEL = "041-000-0000";

export default function MenuInquiryPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const navigate = useNavigate();
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);
  const [toast, setToast] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const menuQuery = useQuery({
    queryKey: apiKeys.menu(id),
    queryFn: () => getDataProvider().getMenu(id),
  });

  const judgementQuery = useQuery({
    queryKey: apiKeys.judgement(id),
    queryFn: () => getDataProvider().postJudgement(id),
  });

  const communicationQuery = useQuery({
    queryKey: [...apiKeys.all, "communication", id],
    queryFn: () =>
      getDataProvider().postCommunication([{ id, role: "menu" }]),
  });

  if (menuQuery.isLoading || judgementQuery.isLoading || communicationQuery.isLoading) {
    return (
      <main className="min-h-[100dvh] bg-background px-5 pt-6">
        <ApiLoading />
      </main>
    );
  }

  if (
    menuQuery.isError ||
    judgementQuery.isError ||
    communicationQuery.isError ||
    !menuQuery.data ||
    !judgementQuery.data ||
    !communicationQuery.data
  ) {
    return (
      <main className="p-6">
        <ApiErrorPanel
          error={
            menuQuery.error ??
            judgementQuery.error ??
            communicationQuery.error
          }
          onRetry={() => {
            void menuQuery.refetch();
            void judgementQuery.refetch();
            void communicationQuery.refetch();
          }}
        />
      </main>
    );
  }

  const menu = menuQuery.data;
  const judgement = judgementQuery.data;
  const message = communicationQuery.data.text;

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setToast(true);
      setTimeout(() => setToast(false), 1600);
    } catch {
      setToast(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background pb-28">
      <header className="flex h-14 items-center px-3">
        <button
          type="button"
          onClick={() => navigateBack(navigate, `/menu/${id}`)}
          className="touch-target inline-flex items-center gap-0.5 text-[15px] font-medium text-primary"
        >
          <ChevronLeft className="size-5" />
          식이 조건 전달
        </button>
      </header>

      <div className="space-y-5 px-5">
        <div>
          <h1 className="text-[24px] font-bold leading-snug text-text">
            매장에 확인해 보세요
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            선택한 조건과 확인 질문을 전달할 수 있어요.
          </p>
        </div>

        <section className="rounded-2xl bg-primary-light p-4">
          <p className="text-[14px] font-bold text-primary">내가 피해야 할 성분</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allergens.map((a) => (
              <span
                key={a}
                className="inline-flex items-center rounded-full bg-card px-3 py-1.5 text-[13px] font-medium text-primary"
              >
                {allergenLabel(a)}
              </span>
            ))}
            {restrictions.map((r) => (
              <span
                key={r}
                className="inline-flex items-center rounded-full bg-card px-3 py-1.5 text-[13px] font-medium text-primary"
              >
                {restrictionLabel(r)}
              </span>
            ))}
            {allergens.length === 0 && restrictions.length === 0 ? (
              <span className="text-[13px] text-muted">선택한 항목 없음</span>
            ) : null}
          </div>
        </section>

        <section>
          <p className="mb-2 text-[14px] font-bold text-text">선택 메뉴</p>
          <div className="rounded-2xl border border-[#eef1ef] bg-card p-4">
            <p className="text-[16px] font-bold text-text">
              {menu.name} · {menu.restaurantName}
            </p>
            <div className="mt-2">
              <StatusBadge status={judgement.status} variant="pill" />
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[14px] font-bold text-text">문의 문구</p>
            <button
              type="button"
              onClick={() => void copyMessage()}
              className="touch-target inline-flex items-center gap-1 text-[13px] font-medium text-primary"
            >
              <Copy className="size-4" />
              문구 복사하기
            </button>
          </div>
          <div className="rounded-2xl border border-[#eef1ef] bg-card p-4 text-[14px] leading-relaxed text-text">
            {message}
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 bg-background px-5 pt-2 safe-bottom">
        <PrimaryButton onClick={() => setSheetOpen(true)}>
          매장에 문의하기
        </PrimaryButton>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="매장에 문의하기"
      >
        <p className="text-[14px] leading-relaxed text-muted">
          {menu.restaurantName}에 전화하거나, 직원에게 확인 화면을 보여줄 수
          있어요.
        </p>
        <div className="mt-4 space-y-2 pb-2">
          <a
            href={`tel:${MOCK_TEL.replace(/-/g, "")}`}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[28px] bg-primary text-[15px] font-semibold text-white"
          >
            <Phone className="size-4" />
            전화 걸기 ({MOCK_TEL})
          </a>
          <button
            type="button"
            onClick={() => {
              setSheetOpen(false);
              navigate(`/show-staff?menuId=${menu.id}`);
            }}
            className="flex h-12 w-full items-center justify-center rounded-[28px] bg-primary-light text-[15px] font-semibold text-primary"
          >
            직원에게 보여주기
          </button>
        </div>
      </BottomSheet>

      <Toast message="문의 문구를 복사했습니다." visible={toast} />
    </main>
  );
}
