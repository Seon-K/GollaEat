"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Chip } from "@/components/Chip";
import { PrimaryButton } from "@/components/PrimaryButton";
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { profileToCriteriaCodes } from "@/lib/api/criteriaMap";
import { ApiError } from "@/lib/api/errors";
import { getDataProvider } from "@/lib/api/providers";
import { useProfileStore } from "@/store/profileStore";

function SetupConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromMy = searchParams.get("from") === "my";
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const hydrateFromApi = useProfileStore((s) => s.hydrateFromApi);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveAndGo = async () => {
    setSaving(true);
    setError(null);
    try {
      const criteria = profileToCriteriaCodes({ allergens, restrictions });
      const updated = await getDataProvider().putProfile(criteria);
      hydrateFromApi(updated);
      saveProfile();
      router.push(fromMy ? "/my" : "/explore");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const editQuery = fromMy ? "from=confirm&return=my" : "from=confirm";

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background pb-28">
      <div className="px-5 pt-4">
        <button
          type="button"
          onClick={() =>
            router.push(
              fromMy ? "/setup/restriction?from=my" : "/setup/restriction",
            )
          }
          className="touch-target inline-flex items-center gap-0.5 text-[14px] font-medium text-primary"
        >
          <ChevronLeft className="size-5" />
          프로필 설정 · 3/3
        </button>

        <h1 className="mt-4 text-[24px] font-bold leading-snug text-text">
          식이 프로필을
          <br />
          확인해 주세요
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          선택한 내용을 확인하고 저장할 수 있어요.
        </p>
      </div>

      <div className="mt-6 flex-1 space-y-4 overflow-y-auto px-5 scrollbar-hide">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-text">알레르겐</h2>
            <button
              type="button"
              onClick={() => router.push(`/setup/allergen?${editQuery}`)}
              className="touch-target inline-flex items-center gap-0.5 text-[13px] font-medium text-primary"
            >
              수정
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {allergens.length === 0 ? (
              <span className="text-[13px] text-muted">선택한 항목 없음</span>
            ) : (
              allergens.map((id) => (
                <Chip key={id} label={allergenLabel(id)} variant="readonly" />
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-text">개별 제한 식재료</h2>
            <button
              type="button"
              onClick={() => router.push(`/setup/restriction?${editQuery}`)}
              className="touch-target inline-flex items-center gap-0.5 text-[13px] font-medium text-primary"
            >
              수정
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {restrictions.length === 0 ? (
              <span className="text-[13px] text-muted">선택한 항목 없음</span>
            ) : (
              restrictions.map((id) => (
                <Chip
                  key={id}
                  label={restrictionLabel(id)}
                  variant="readonly"
                />
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-primary-light px-4 py-4">
          <p className="text-[14px] font-bold leading-relaxed text-primary">
            설정한 모든 제한 조건을 함께 적용합니다.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-text">
            식이조건 일치 결과는 교차접촉에 대한 안전 보증을 의미하지 않습니다.
          </p>
        </section>

        {error ? (
          <p className="text-center text-[13px] text-error">{error}</p>
        ) : null}
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 bg-background px-5 pt-3 safe-bottom">
        <PrimaryButton onClick={() => void saveAndGo()} disabled={saving}>
          {saving
            ? "저장 중…"
            : fromMy
              ? "설정 저장하고 마이페이지로"
              : "설정 저장하고 메뉴 탐색하기"}
        </PrimaryButton>
      </div>
    </main>
  );
}

export default function SetupConfirmPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-background" />}>
      <SetupConfirmContent />
    </Suspense>
  );
}
