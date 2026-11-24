import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import type { ApiReview } from "@/lib/api/types";
import { getDataProvider } from "@/lib/api/providers";
import { apiKeys } from "@/lib/api/keys";
import { ApiErrorPanel } from "./ApiState";
import { BottomSheet } from "./BottomSheet";
import { PrimaryButton } from "./PrimaryButton";
import { SkeletonBlock } from "./LoadingSkeleton";

export function ReviewCard({ review, showMenu = false, fallbackLabel, onDeleted }: {
  review: ApiReview; showMenu?: boolean; fallbackLabel?: string; onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false), [confirm, setConfirm] = useState(false);
  const [above, setAbove] = useState(false);
  const [draft, setDraft] = useState(review.body);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), lock = useRef(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (action: "edit" | "delete") => {
      if (action === "edit") await getDataProvider().updateReview(review.id, draft.trim());
      else await getDataProvider().deleteReview(review.id);
    },
    retry: false,
    onSuccess: (_, action) => {
      setEditing(false); setConfirm(false);
      void client.invalidateQueries({ queryKey: apiKeys.reviews().slice(0, 2) });
      if (action === "delete") onDeleted?.();
    },
  });
  const submit = async (action: "edit" | "delete") => {
    if (lock.current || !review.is_mine || (action === "edit" && (!draft.trim() || draft.trim().length > 5000))) return;
    lock.current = true;
    try { await mutation.mutateAsync(action); } catch { /* Retain draft/confirmation for retry. */ }
    finally { lock.current = false; }
  };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const labels = review.disclosed_conditions?.map((condition) => condition.name) ?? [];
  if (!labels.length && review.is_mine && fallbackLabel) labels.push(fallbackLabel);
  return <article className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-2">
      {showMenu ? <div className="min-w-0"><Link to={`/menu/${encodeURIComponent(review.menu_id)}?from=my&tab=reviews`} className="text-base font-bold text-primary hover:underline">{review.menu_name ?? "작성한 메뉴 보기"}</Link>{review.restaurant_name && <p className="mt-1 text-xs text-muted">{review.restaurant_name}</p>}</div> :
        <div className="flex flex-wrap items-center gap-2"><span className="inline-flex size-8 items-center justify-center rounded-full bg-primary-light text-xs font-bold text-primary">{review.is_mine ? "나" : "리"}</span><span className="text-sm font-semibold">{review.is_mine ? "나**" : "방문객"}</span>{labels.map((label) => <span key={label} className="inline-flex h-6 items-center rounded-full bg-primary-light px-2 text-[11px] font-medium text-primary">{label}</span>)}</div>}
      {review.is_mine && <div ref={root} className="relative shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
        if (event.key === "Tab") setOpen(false);
        if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
        <button ref={trigger} type="button" aria-label="리뷰 관리" aria-haspopup="menu" aria-expanded={open} disabled={mutation.isPending} onClick={() => { setAbove((trigger.current?.getBoundingClientRect().bottom ?? 0) + 104 > window.innerHeight - 160); setOpen(!open); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setAbove((trigger.current?.getBoundingClientRect().bottom ?? 0) + 104 > window.innerHeight - 160); setOpen(true); } }} className="touch-target inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-shell"><EllipsisVertical className="size-5" /></button>
        {open && <div role="menu" aria-label="리뷰 관리" className={`absolute right-0 ${above ? "bottom-full" : "top-full"} z-30 w-36 rounded-2xl border border-border bg-card p-1.5 shadow-lg`}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setDraft(review.body); mutation.reset(); setEditing(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-sm hover:bg-shell"><Pencil className="size-4" />수정</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); mutation.reset(); setConfirm(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-sm text-error hover:bg-error-light"><Trash2 className="size-4" />삭제</button>
        </div>}
      </div>}
    </div>
    {editing ? <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void submit("edit"); }}>
      <textarea aria-label="리뷰 수정 내용" value={draft} onChange={(event) => setDraft(event.target.value)} required maxLength={5000} disabled={mutation.isPending} className="min-h-24 w-full rounded-xl border border-border-strong bg-card p-3 text-sm" />
      <div className="flex justify-end gap-2"><button type="button" disabled={mutation.isPending} onClick={() => { setEditing(false); mutation.reset(); }} className="rounded-full px-4 py-2 text-sm text-muted">취소</button><button type="submit" disabled={mutation.isPending || !draft.trim() || draft.trim() === review.body} aria-busy={mutation.isPending} className="rounded-full bg-primary-light px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">{mutation.isPending ? <SkeletonBlock className="h-4 w-12" /> : "저장"}</button></div>
      {mutation.isError && <div role="alert"><ApiErrorPanel error={mutation.error} /></div>}
    </form> : <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{review.body}</p>}
    {showMenu && !!labels.length && <div className="mt-3 flex flex-wrap gap-1.5">{labels.map((label) => <span key={label} className="inline-flex h-6 items-center rounded-full bg-primary-light px-2 text-[11px] font-medium text-primary">{label}</span>)}</div>}
    {showMenu && <time dateTime={review.created_at} className="mt-3 block text-xs text-muted">{new Date(review.created_at).toLocaleDateString("ko-KR")}</time>}
    {!showMenu && <p className="mt-2 text-[11px] text-muted">방문 경험은 메뉴 안전을 보증하지 않습니다.</p>}
    <BottomSheet open={confirm} onClose={() => { if (!mutation.isPending) setConfirm(false); }} title="리뷰 삭제">
      <p className="mb-5 text-sm text-muted">이 리뷰를 삭제할까요?</p>
      {mutation.isError && <div role="alert" className="mb-3"><ApiErrorPanel error={mutation.error} /></div>}
      <div className="flex gap-2"><button type="button" disabled={mutation.isPending} onClick={() => setConfirm(false)} className="w-full rounded-full border border-border-strong px-4 py-3 text-sm">취소</button><PrimaryButton disabled={mutation.isPending} aria-busy={mutation.isPending} onClick={() => void submit("delete")}>{mutation.isPending ? <SkeletonBlock className="h-4 w-12 !bg-white/40" /> : "삭제"}</PrimaryButton></div>
    </BottomSheet>
  </article>;
}
