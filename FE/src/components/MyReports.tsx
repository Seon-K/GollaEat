import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { apiKeys } from "@/lib/api/keys";
import { getDataProvider } from "@/lib/api/providers";
import { ApiErrorPanel, ApiLoading } from "./ApiState";
import { Pagination } from "./Pagination";
import type { ApiReport, ReportCategory } from "@/lib/api/types";

const CATEGORY: Record<ReportCategory, string> = {
  menu_price: "메뉴·가격", ingredients_allergens: "재료·알레르겐", business: "영업정보", other: "기타",
};
const STATUS: Record<ApiReport["status"], { label: string; style: string }> = {
  pending: { label: "검토 대기", style: "bg-shell text-muted" },
  reviewing: { label: "검토 중", style: "bg-primary-light text-primary" },
  resolved: { label: "처리 완료", style: "bg-primary-light text-primary" },
  rejected: { label: "미반영", style: "bg-shell text-muted" },
};

export function MyReports({ active = true }: { active?: boolean }) {
  const [page, setPage] = useState(1);
  const reports = useQuery({ enabled: active, queryKey: apiKeys.myReports(page),
    queryFn: ({ signal }) => getDataProvider().getMyReports(page, { signal }) });
  if (!active) return null;
  if (reports.isPending) return <ApiLoading label="내 제보 로딩 중" />;
  if (reports.isError) return <ApiErrorPanel error={reports.error} onRetry={() => void reports.refetch()} />;
  return <div className="space-y-3">
    <p className="text-xs leading-relaxed text-muted">현재 이용 중인 계정 또는 브라우저 세션에서 작성한 정보 오류 신고와 제보입니다.</p>
    {!reports.data.items.length ? <div className="rounded-2xl border border-dashed border-border-strong bg-card px-6 py-12 text-center">
      <FileText className="mx-auto size-8 text-muted" aria-hidden="true" />
      <p className="mt-3 font-semibold">작성한 제보가 없습니다</p>
      <p className="mt-1 text-sm text-muted">메뉴 상세에서 변경된 정보나 확인한 내용을 알려주세요.</p>
    </div> : reports.data.items.map((report) => {
      const status = STATUS[report.status];
      return <article key={report.report_id} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{CATEGORY[report.category]} <span className="font-normal text-muted">#{report.report_id}</span></h3>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>{status.label}</span>
        </div>
        <time dateTime={report.created_at} className="mt-2 block text-xs text-muted">{new Date(report.created_at).toLocaleDateString("ko-KR")}</time>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{report.content}</p>
        {report.reviewed_at && <p className="mt-3 text-xs text-muted">검토일 {new Date(report.reviewed_at).toLocaleDateString("ko-KR")}</p>}
        {report.menu_id && <Link to={`/menu/${encodeURIComponent(report.menu_id)}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">대상 메뉴 보기</Link>}
      </article>;
    })}
    <Pagination page={page} totalPages={reports.data.pagination.totalPages} disabled={reports.isFetching} onChange={setPage} />
  </div>;
}
