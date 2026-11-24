import { useNavigate, useSearchParams } from "react-router-dom";

import { Chip } from "@/components/Chip";
import { SetupFooter } from "@/components/setup/SetupFooter";
import { SetupStepLabel } from "@/components/setup/SetupProgress";
import {
  RESTRICTION_CATEGORIES,
  RESTRICTIONS,
  restrictionLabel,
} from "@/data/restrictions";
import { useProfileStore } from "@/store/profileStore";
import type { RestrictionId } from "@/types";

function RestrictionSetupContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from");
  const returnTo = searchParams.get("return");
  const fromConfirm = from === "confirm";
  const fromMy = from === "my";
  const returnMy = returnTo === "my" || fromMy;
  const restrictions = useProfileStore((s) => s.restrictions);
  const toggleRestriction = useProfileStore((s) => s.toggleRestriction);

  const goNext = () => {
    if (fromConfirm || fromMy) {
      navigate(returnMy ? "/setup/confirm?from=my" : "/setup/confirm");
    } else {
      navigate("/setup/confirm");
    }
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background pb-36">
      <div className="px-5 pt-5">
        <SetupStepLabel step={2} stepSuffix="채식 및 제한 식재료" />
        <h1 className="mt-3 text-[24px] font-bold leading-snug text-text">
          추가로 먹지 않는
          <br />
          재료가 있나요?
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          서버에서 지원하는 제한 재료 {RESTRICTIONS.length}종 중 먹지 않는 항목을 선택해 주세요.
        </p>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto px-5 scrollbar-hide">
        <p className="text-[14px] font-bold text-text">선택한 제한 재료</p>
        <div className="mt-2 rounded-2xl bg-primary-light px-4 py-3.5">
          {restrictions.length === 0 ? (
            <p className="text-center text-[14px] font-medium text-primary">
              선택한 항목 없음
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {restrictions.map((id) => (
                <Chip
                  key={id}
                  label={restrictionLabel(id)}
                  variant="removable"
                  onRemove={() => toggleRestriction(id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-5 pb-4">
          {RESTRICTION_CATEGORIES.map((cat) => (
            <section key={cat}>
              <p className="mb-2 text-[15px] font-bold text-text">{cat}</p>
              <div className="grid grid-cols-3 gap-2">
                {RESTRICTIONS.filter((r) => r.category === cat).map((r) => {
                  const selected = restrictions.includes(r.id);
                  return (
                    <Chip
                      key={r.id}
                      label={r.label}
                      variant={selected ? "selected" : "default"}
                      onClick={() =>
                        toggleRestriction(r.id as RestrictionId)
                      }
                      className="w-full"
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <SetupFooter
        onNext={goNext}
        nextLabel={
          fromConfirm ? "확인으로 돌아가기" : "다음 · 프로필 확인"
        }
        hint={
          <p className="text-center text-[12px] text-muted">
            제한 재료가 없어도 다음 단계로 이동할 수 있습니다.
          </p>
        }
      />
    </main>
  );
}


export default RestrictionSetupContent;
