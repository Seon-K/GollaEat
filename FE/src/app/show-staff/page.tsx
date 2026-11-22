"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { ApiErrorPanel, ApiLoading } from "@/components/ApiState";
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { useWakeLock } from "@/hooks/useWakeLock";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { joinWithDot } from "@/lib/inquiry";
import { navigateBack } from "@/lib/navBack";
import { useProfileStore } from "@/store/profileStore";

function ShowStaffContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const menuId = searchParams.get("menuId");
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);

  useWakeLock(true);

  const communicationQuery = useQuery({
    queryKey: [...apiKeys.all, "communication", menuId ?? "profile"],
    queryFn: () =>
      menuId
        ? getDataProvider().postCommunication([{ id: menuId, role: "menu" }])
        : Promise.resolve({
            status: "check" as const,
            text: "",
            orderStatus: "check" as const,
          }),
    enabled: Boolean(menuId),
  });

  const allergenText = joinWithDot(allergens.map(allergenLabel));
  const restrictionText = joinWithDot(restrictions.map(restrictionLabel));

  return (
    <main className="flex min-h-[100dvh] flex-col bg-primary-dark px-5 pb-8 pt-4 text-white">
      <header className="flex h-12 items-center justify-between">
        <p className="text-[15px] font-medium text-white">직원에게 보여주세요</p>
        <button
          type="button"
          onClick={() =>
            navigateBack(
              router,
              menuId ? `/menu/${menuId}/inquiry` : "/explore",
            )
          }
          className="inline-flex size-10 items-center justify-center rounded-full bg-white/15 touch-target"
          aria-label="닫기"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="mt-6 flex-1">
        <h1 className="text-[26px] font-bold leading-snug text-white">
          주문 전, 식재료 확인을
          <br />
          부탁드립니다.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-white/90">
          안녕하세요. 저는 알레르기 및 개인적인
          <br />
          식이 제한으로 인해 아래 재료를 섭취하지
          <br />
          않고 있습니다.
        </p>

        <div className="mt-6 rounded-3xl bg-primary/55 p-5 backdrop-blur-[2px]">
          <p className="text-[13px] text-white/80">알레르기 유발 재료</p>
          <p className="mt-2 text-[22px] font-bold leading-snug text-white">
            {allergenText || "없음"}
          </p>
          <div className="my-4 h-px bg-white/25" />
          <p className="text-[13px] text-white/80">그 외 먹지 않는 재료</p>
          <p className="mt-2 text-[22px] font-bold leading-snug text-white">
            {restrictionText || "없음"}
          </p>
          <p className="mt-5 text-[12px] text-white/60">현재 식이 프로필 기준</p>
        </div>

        {menuId && communicationQuery.isLoading ? (
          <div className="mt-6 text-white/80">
            <ApiLoading />
          </div>
        ) : null}
        {menuId && communicationQuery.isError ? (
          <div className="mt-6">
            <ApiErrorPanel
              error={communicationQuery.error}
              onRetry={() => void communicationQuery.refetch()}
            />
          </div>
        ) : null}
        {communicationQuery.data?.text ? (
          <p className="mt-6 text-[15px] leading-relaxed text-white/90">
            {communicationQuery.data.text}
          </p>
        ) : (
          <>
            <p className="mt-6 text-[15px] leading-relaxed text-white/90">
              혹시 주문하려는 메뉴에 위 재료들이
              <br />
              들어가는지 확인해 주실 수 있을까요?
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/90">
              소스나 양념, 육수에 들어가는 재료도
              <br />
              함께 알려주시면 정말 감사하겠습니다.
            </p>
          </>
        )}
        <p className="mt-5 text-[16px] font-bold text-white">
          확인해 주셔서 감사합니다.
        </p>
      </div>

      <p className="text-center text-[12px] text-white/50 safe-bottom">
        닫으면 이전 메뉴 화면으로 돌아갑니다.
      </p>
    </main>
  );
}

export default function ShowStaffPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-primary-dark text-white">
          준비 중…
        </main>
      }
    >
      <ShowStaffContent />
    </Suspense>
  );
}
