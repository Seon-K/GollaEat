import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { ApiErrorPanel, ApiLoading } from "@/components/ApiState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SkeletonBlock } from "@/components/LoadingSkeleton";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { ApiError } from "@/lib/api/errors";
import type { ReportCategory } from "@/lib/api/types";
import { navigateBack } from "@/lib/navBack";

const REPORT_TYPES: { id: ReportCategory; label: string }[] = [
  { id: "menu_price", label: "메뉴·가격" }, { id: "ingredients_allergens", label: "재료·알레르겐" },
  { id: "business", label: "영업정보" }, { id: "other", label: "기타" },
];

export default function MenuReportPage({ mode = "error" }: { mode?: "error" | "contribution" }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const contribution = mode === "contribution";
  const title = contribution ? "정보 제보" : "정보 오류";
  const back = searchParams.get("from") === "staff" ? `/show-staff?menuId=${encodeURIComponent(id)}` : `/menu/${encodeURIComponent(id)}`;
  const [category, setCategory] = useState<ReportCategory>("menu_price");
  const [content, setContent] = useState("");
  const submitting = useRef(false);
  const menu = useQuery({ queryKey: apiKeys.menu(id), queryFn: () => getDataProvider().getMenu(id) });
  const report = useMutation({ mutationFn: () => getDataProvider().createReport({ ...(category === "business" && menu.data?.restaurantId ? { restaurant_id: menu.data.restaurantId } : { menu_id: id }), category, content: content.trim() }), retry: false });
  const submit = async () => {
    if (submitting.current || report.isSuccess || !content.trim() || content.trim().length > 5000 || !menu.data) return;
    submitting.current = true;
    try {
      await report.mutateAsync();
      void client.invalidateQueries({ queryKey: [...apiKeys.all, "reports"] });
    } catch { /* Keep input for retry. */ }
    finally { submitting.current = false; }
  };
  if (menu.isPending && !menu.isError) return <main className="min-h-[100dvh] bg-background px-5 pt-6"><ApiLoading variant="detail" /></main>;
  if (menu.isError || !menu.data) return <main className="min-h-[100dvh] bg-background p-5"><ApiErrorPanel error={menu.error ?? new Error("메뉴를 찾을 수 없습니다.")} onRetry={() => void menu.refetch()} /><Link to="/explore" className="mt-4 inline-block text-primary">홈으로</Link></main>;
  const error = report.error instanceof ApiError ? new Error(report.error.errorObject?.message ?? report.error.message) : report.error;
  return <main className="min-h-[100dvh] bg-background pb-32">
    <header className="flex h-14 items-center px-3"><button type="button" onClick={() => navigateBack(navigate, back)} className="touch-target inline-flex items-center gap-0.5 text-[15px] font-medium text-primary"><ChevronLeft className="size-5" />{searchParams.get("from") === "staff" ? "직원에게 보여주기" : "메뉴 상세"}</button></header>
    <div className="space-y-6 px-5">
      <div><h1 className="text-[24px] font-bold">{title}</h1><p className="mt-2 text-sm text-muted">{contribution ? "매장에서 직접 확인한 정보를 알려주세요." : "잘못되거나 변경된 정보를 알려주세요."}</p></div>
      <section><h2 className="mb-2 text-sm font-bold">대상 메뉴</h2><div className="rounded-2xl border border-border bg-card p-4"><p className="font-bold">{menu.data.name}</p><p className="mt-1 text-sm text-muted">{menu.data.restaurantName}</p></div></section>
      {report.isSuccess ? <section role="status" className="space-y-3 rounded-2xl border border-border bg-card p-5 text-center">
        <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-bold">{contribution ? "제보가 접수되었습니다" : "오류 신고가 접수되었습니다"}</h2>
        <p className="text-sm text-muted">접수 번호 #{report.data.report_id} · 검토 대기</p>
        <p className="text-sm leading-relaxed text-muted">보내주신 정보는 검토 후 반영됩니다. 접수만으로 메뉴 정보나 식이 판정이 변경되지는 않습니다.</p>
        <PrimaryButton onClick={() => navigate(`/menu/${encodeURIComponent(id)}`, { replace: true })}>메뉴 상세로</PrimaryButton>
      </section> : <form id="menu-information-report" className="space-y-6" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={report.isPending} className="space-y-2"><legend className="mb-3 text-sm font-bold">{contribution ? "어떤 정보를 확인하셨나요?" : "어떤 정보가 잘못되었나요?"}</legend>
          {REPORT_TYPES.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm">
            <input type="radio" name="report-category" value={item.id} checked={category === item.id} onChange={() => setCategory(item.id)} className="peer sr-only" />
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${category === item.id ? "border-primary" : "border-border-strong"}`} aria-hidden="true">{category === item.id && <span className="size-2.5 rounded-full bg-primary" />}</span>{item.label}
          </label>)}
        </fieldset>
        <div><label htmlFor="report-content" className="mb-2 block text-sm font-bold">{contribution ? "확인한 정보" : "변경 또는 오류 내용"}</label>
          <textarea id="report-content" required maxLength={5000} disabled={report.isPending} value={content} onChange={(event) => setContent(event.target.value)} placeholder={contribution ? "확인한 날짜와 매장 직원에게 안내받은 내용 등을 적어주세요." : "현재 표시된 정보와 다른 점을 구체적으로 적어주세요."} aria-describedby="report-guidance" className="min-h-40 w-full resize-y rounded-2xl border border-border-strong bg-card p-4 text-sm outline-none focus:border-primary" />
          <p className="mt-1 text-right text-xs text-muted">{content.length.toLocaleString()} / 5,000자</p>
        </div>
        <p id="report-guidance" className="text-xs leading-relaxed text-muted">검토 후 반영되며, 제보만으로 식이조건 일치나 안전성이 확인되는 것은 아닙니다.</p>
        {report.isError && <div role="alert"><ApiErrorPanel error={error} /></div>}
      </form>}
    </div>
    {!report.isSuccess && <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-phone -translate-x-1/2 bg-background/95 px-5 pt-3 backdrop-blur safe-bottom"><PrimaryButton form="menu-information-report" type="submit" disabled={!content.trim() || report.isPending} aria-busy={report.isPending} aria-label={report.isPending ? "접수 요청 중" : undefined}>{report.isPending ? <SkeletonBlock className="h-4 w-28 !bg-white/40" /> : contribution ? "정보 제보하기" : "오류 신고하기"}</PrimaryButton></div>}
  </main>;
}
