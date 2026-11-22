import { useParams, useNavigate } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Info,
  XCircle,
} from "lucide-react";
import { ApiErrorPanel, ApiLoading } from "@/components/ApiState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusBadge } from "@/components/StatusBadge";
import type { ReasoningRowUi } from "@/lib/api/adapters";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { navigateBack } from "@/lib/navBack";
import { VERDICT_COPY } from "@/lib/verdictCopy";
import type { JudgementStatus } from "@/types";

function ReasonIcon({ status }: { status: JudgementStatus }) {
  if (status === "match") {
    return <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden />;
  }
  if (status === "check") {
    return (
      <AlertTriangle className="size-5 shrink-0 text-accent-text" aria-hidden />
    );
  }
  return <XCircle className="size-5 shrink-0 text-error" aria-hidden />;
}

function rowDetail(row: ReasoningRowUi): string {
  if (row.detail) return row.detail;
  if (row.status === "match") return "사용하지 않는 것으로 확인";
  if (row.status === "mismatch") return "포함 확인됨";
  return "포함 정보 없음 · 재료 정보 확인";
}

export default function MenuReasoningPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const navigate = useNavigate();

  const menuQuery = useQuery({
    queryKey: apiKeys.menu(id),
    queryFn: () => getDataProvider().getMenu(id),
  });

  const judgementQuery = useQuery({
    queryKey: apiKeys.judgement(id),
    queryFn: () => getDataProvider().postJudgement(id),
  });

  if (menuQuery.isLoading || judgementQuery.isLoading) {
    return (
      <main className="min-h-[100dvh] bg-background px-5 pt-6">
        <ApiLoading />
      </main>
    );
  }

  if (menuQuery.isError || judgementQuery.isError || !menuQuery.data || !judgementQuery.data) {
    return (
      <main className="p-6">
        <ApiErrorPanel
          error={menuQuery.error ?? judgementQuery.error}
          onRetry={() => {
            void menuQuery.refetch();
            void judgementQuery.refetch();
          }}
        />
      </main>
    );
  }

  const menu = menuQuery.data;
  const judgement = judgementQuery.data;
  const copy = VERDICT_COPY[judgement.status];
  const panelDescription =
    judgement.status === "check" && judgement.unknownItems.length > 0
      ? "재료 정보 없음 · 매장 확인 필요"
      : copy.description;

  return (
    <main className="min-h-[100dvh] bg-background pb-28">
      <header className="flex h-14 items-center px-3">
        <button
          type="button"
          onClick={() => navigateBack(navigate, `/menu/${id}`)}
          className="touch-target inline-flex items-center gap-0.5 text-[15px] font-medium text-primary"
        >
          <ChevronLeft className="size-5" />
          메뉴 상세
        </button>
      </header>

      <div className="space-y-4 px-5">
        <div>
          <p className="text-[14px] font-medium text-text">판단 근거 확인</p>
          <h1 className="mt-1 text-[22px] font-bold text-text">{menu.name}</h1>
        </div>

        <StatusBadge
          status={judgement.status}
          variant="panel"
          description={panelDescription}
        />

        <section>
          <h2 className="mb-3 text-[15px] font-bold text-text">
            내 식이 조건별 비교
          </h2>
          <ul className="space-y-2">
            {judgement.reasons.map((r) => (
              <li
                key={r.conditionCode}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#eef1ef] bg-card px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-text">{r.label}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{rowDetail(r)}</p>
                </div>
                <ReasonIcon status={r.status} />
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-accent-light px-4 py-4">
          <div className="flex items-center gap-2 text-accent-text">
            <Info className="size-4 shrink-0" strokeWidth={2.4} />
            <h2 className="text-[14px] font-bold">확인 범위 안내</h2>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text">
            기본 메뉴의 공개된 재료 정보 기준 판정입니다.
            <br />
            소스·육수 변경 및 교차접촉은 포함하지 않습니다.
          </p>
        </section>
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 bg-background px-5 pt-2 safe-bottom">
        <PrimaryButton onClick={() => navigate(`/menu/${id}/inquiry`)}>
          매장에 문의하기
        </PrimaryButton>
      </div>
    </main>
  );
}
