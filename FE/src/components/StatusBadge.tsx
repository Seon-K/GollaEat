import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { VERDICT_COPY } from "@/lib/verdictCopy";
import type { VerdictStatus } from "@/types";

const ICONS = {
  match: CheckCircle2,
  check: AlertTriangle,
  mismatch: XCircle,
} as const;

const PILL_CLASS: Record<VerdictStatus, string> = {
  match: "bg-primary-light text-primary",
  check: "bg-accent-light text-accent-text",
  mismatch: "bg-error-light text-error",
};

const PANEL_BG: Record<VerdictStatus, string> = {
  match: "bg-primary-light",
  check: "bg-accent-light",
  mismatch: "bg-error-light",
};

const PANEL_TITLE: Record<VerdictStatus, string> = {
  match: "text-primary",
  check: "text-accent-text",
  mismatch: "text-error",
};

export type StatusBadgeVariant = "pill" | "panel";

interface StatusBadgeProps {
  title?: string;
  status: VerdictStatus;
  /** pill: 리스트용 작은 배지 / panel: p16 큰 카드(제목+설명) */
  variant?: StatusBadgeVariant;
  /** panel에서 설명 문구 오버라이드 (기본: VERDICT_COPY) */
  description?: string;
  note?: string;
  className?: string;
}

export function StatusBadge({
  status,
  title: customTitle,
  variant = "pill",
  description,
  note,
  className = "",
}: StatusBadgeProps) {
  const Icon = ICONS[status];
  const { title: defaultTitle, description: defaultDesc } = VERDICT_COPY[status];
  const title = customTitle ?? defaultTitle;

  if (variant === "panel") {
    return (
      <div
        className={`w-full rounded-2xl px-5 py-5 ${PANEL_BG[status]} ${className}`}
        role="status"
      >
        <div className={`flex items-center gap-2 ${PANEL_TITLE[status]}`}>
          <Icon className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
          <p className="text-[18px] font-bold leading-none">{title}</p>
        </div>
        <p className="mt-2.5 text-[15px] leading-relaxed text-text">
          {description ?? defaultDesc}
        </p>
        {note ? (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{note}</p>
        ) : null}
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold ${PILL_CLASS[status]} ${className}`}
      role="status"
      aria-label={title}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{title}</span>
    </span>
  );
}

/** @deprecated StatusBadge variant="panel" 사용 */
export function StatusCard({
  status,
  description,
  note,
}: {
  status: VerdictStatus;
  description?: string;
  note?: string;
}) {
  return (
    <StatusBadge
      status={status}
      variant="panel"
      description={description}
      note={note}
    />
  );
}
