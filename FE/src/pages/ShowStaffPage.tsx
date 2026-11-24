import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { X } from "lucide-react";
import { useWakeLock } from "@/hooks/useWakeLock";
import { joinWithDot } from "@/lib/inquiry";
import { navigateBack } from "@/lib/navBack";
import { staffSectionLabels } from "@/lib/profileLabels";
import { useProfileStore } from "@/store/profileStore";

function ShowStaffContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const menuId = searchParams.get("menuId");
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);

  useWakeLock(true);

  const { allergenLabels, restrictionLabels } = staffSectionLabels(
    allergens,
    restrictions,
  );
  const allergenText = joinWithDot(allergenLabels);
  const restrictionText = joinWithDot(restrictionLabels);

  return (
    <main className="staff-view flex min-h-[100dvh] flex-col bg-primary-dark px-5 pb-8 pt-4 text-white">
      <header className="flex h-12 items-center justify-between">
        <p className="text-[15px] font-medium text-white">직원에게 보여주세요</p>
        <button
          type="button"
          onClick={() =>
            navigateBack(
              navigate,
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
        <p className="mt-5 text-[16px] font-bold text-white">
          확인해 주셔서 감사합니다.
        </p>
      </div>

      <Link to={menuId ? `/menu/${encodeURIComponent(menuId)}/contribute?from=staff` : "/explore"}
        className="mt-8 flex min-h-12 items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-semibold text-primary-dark">
        {menuId ? "매장에서 확인한 정보 제보하기" : "제보할 메뉴 선택하기"}
      </Link>
      <p className="mt-6 text-center text-[12px] text-white/50 safe-bottom">
        닫으면 이전 메뉴 화면으로 돌아갑니다.
      </p>
    </main>
  );
}

export default ShowStaffContent;
