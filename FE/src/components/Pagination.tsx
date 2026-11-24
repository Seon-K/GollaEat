import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, totalPages, disabled, onChange }: {
  page: number; totalPages: number; disabled?: boolean; onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, Math.min(page - 1, totalPages - 2));
  const pages = Array.from({ length: Math.min(3, totalPages) }, (_, index) => start + index);
  const button = "flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-card text-sm text-text transition-colors hover:bg-primary-light disabled:opacity-40";
  return <nav aria-label="메뉴 페이지" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
    <button type="button" aria-label="이전 페이지" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)} className={button}><ChevronLeft className="size-4" /></button>
    {start > 1 && <><button type="button" aria-label="1페이지" disabled={disabled} onClick={() => onChange(1)} className={button}>1</button>{start > 2 && <span aria-hidden="true" className="text-xs text-muted">…</span>}</>}
    {pages.map((number) => <button key={number} type="button" aria-label={`${number}페이지`} aria-current={number === page ? "page" : undefined}
      disabled={disabled} onClick={() => onChange(number)} className={number === page ? `${button} !border-primary !bg-primary font-semibold !text-white` : button}>{number}</button>)}
    {pages[pages.length - 1] < totalPages && <>{pages[pages.length - 1] < totalPages - 1 && <span aria-hidden="true" className="text-xs text-muted">…</span>}<button type="button" aria-label={`${totalPages}페이지`} disabled={disabled} onClick={() => onChange(totalPages)} className={button}>{totalPages}</button></>}
    <button type="button" aria-label="다음 페이지" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)} className={button}><ChevronRight className="size-4" /></button>
  </nav>;
}
