import { useNavigate, useSearchParams } from "react-router-dom";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Chip } from "@/components/Chip";
import { SetupFooter } from "@/components/setup/SetupFooter";
import {
  SetupProgressBar,
  SetupStepLabel,
} from "@/components/setup/SetupProgress";
import { ALLERGENS, allergenLabel } from "@/data/allergens";
import { useProfileStore } from "@/store/profileStore";
import type { AllergenId } from "@/types";

function AllergenSetupContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from");
  const returnTo = searchParams.get("return");
  const fromConfirm = from === "confirm";
  const fromMy = from === "my";
  const returnMy = returnTo === "my" || fromMy;
  const [query, setQuery] = useState("");
  const allergens = useProfileStore((s) => s.allergens);
  const toggleAllergen = useProfileStore((s) => s.toggleAllergen);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return ALLERGENS;
    return ALLERGENS.filter((a) => a.label.includes(q));
  }, [query]);

  const goNext = () => {
    if (fromConfirm) {
      navigate(returnMy ? "/setup/confirm?from=my" : "/setup/confirm");
    } else if (fromMy) {
      navigate("/setup/restriction?from=my");
    } else {
      navigate("/setup/restriction");
    }
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background pb-28">
      <div className="px-5 pt-5">
        <SetupStepLabel step={1} />
        <h1 className="mt-3 text-[24px] font-bold leading-snug text-text">
          어떤 알레르겐을
          <br />
          피하시나요?
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          해당하는 항목을 모두 선택해 주세요.
        </p>
        <div className="mt-4">
          <SetupProgressBar step={1} />
        </div>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto px-5 scrollbar-hide">
        <div className="flex h-12 items-center gap-2 rounded-2xl border border-[#e5e8e6] bg-card px-3">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="알레르겐 검색"
            className="w-full bg-transparent text-[14px] placeholder:text-muted"
            aria-label="알레르겐 검색"
          />
        </div>

        <p className="mt-4 text-[13px] font-semibold text-primary">
          선택됨 {allergens.length}개
        </p>
        {allergens.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {allergens.map((id) => (
              <Chip
                key={id}
                label={allergenLabel(id)}
                variant="removable"
                onRemove={() => toggleAllergen(id)}
              />
            ))}
          </div>
        ) : null}

        <p className="mt-6 text-[15px] font-bold text-text">
          알레르기 유발물질 19종
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 pb-4">
          {filtered.map((a) => {
            const selected = allergens.includes(a.id);
            return (
              <Chip
                key={a.id}
                label={a.label}
                variant={selected ? "selected" : "default"}
                onClick={() => toggleAllergen(a.id as AllergenId)}
                className="w-full"
              />
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-muted">
            검색 결과가 없습니다.
          </p>
        ) : null}
      </div>

      <SetupFooter
        onNext={goNext}
        nextLabel={
          fromConfirm ? "확인으로 돌아가기" : "다음 · 제한 재료 설정"
        }
      />
    </main>
  );
}


export default AllergenSetupContent;
