import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface ExploreSelectOption { id: string; label: string }
interface ExploreSelectProps {
  triggerLabel: string; ariaLabel?: string; triggerIcon?: ReactNode; options: ExploreSelectOption[];
  value: string; onChange: (id: string) => void; align?: "left" | "right"; className?: string;
  side?: "top" | "bottom"; topBoundary?: number;
}
export function ExploreSelect({ triggerLabel, ariaLabel, triggerIcon, options, value, onChange, align = "left", className = "", side = "bottom", topBoundary = 0 }: ExploreSelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const left = Math.max(12, (window.innerWidth - 430) / 2 + 12);
    const right = Math.min(window.innerWidth - 12, (window.innerWidth + 430) / 2 - 12);
    const width = Math.min(220, right - left);
    setPosition({
      left: Math.max(left, Math.min(right - width, align === "right" ? trigger.right - width : trigger.left)),
      width,
      top: side === "bottom" ? trigger.bottom + 8 : undefined,
      bottom: side === "top" ? window.innerHeight - trigger.top + 8 : undefined,
      maxHeight: Math.max(48, Math.min(window.innerHeight * 0.45, side === "top" ? trigger.top - topBoundary - 12 : window.innerHeight - trigger.bottom - 12)),
    });
  }, [open, side, topBoundary, align]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')?.focus();
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node) && !listRef.current?.contains(event.target as Node)) setOpen(false); };
    const moved = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [open]);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  return <div ref={rootRef} className={`relative ${className}`} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") setOpen(false);
  }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !listRef.current?.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={triggerRef} type="button" onClick={() => { setOpen(!open); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
    }} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-label={ariaLabel ?? triggerLabel}
      className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium shadow-sm touch-target ${open ? "border-primary bg-primary-light text-primary" : "border-border-strong bg-card text-text"}`}>
      {triggerIcon}<span>{triggerLabel}</span><ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
    {open && createPortal(<div ref={listRef} id={listId} role="listbox" aria-label={ariaLabel ?? triggerLabel} style={position}
      className="fixed z-[100] overflow-y-auto rounded-2xl border border-border-strong bg-card p-1.5 shadow-[0_8px_32px_rgba(37,42,39,0.16)]">
      {options.map((option, index) => <button key={option.id} type="button" role="option" aria-selected={option.id === value}
        onClick={() => { onChange(option.id); close(); }} onKeyDown={(event) => {
          const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
          let next = index;
          if (event.key === "ArrowDown") next = (index + 1) % options.length;
          else if (event.key === "ArrowUp") next = (index + options.length - 1) % options.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = options.length - 1;
          else return;
          event.preventDefault(); buttons?.[next]?.focus();
        }} className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-primary-light ${option.id === value ? "bg-primary-light font-semibold text-primary" : "text-text"}`}>
        {option.label}{option.id === value && <Check className="size-4" aria-hidden />}
      </button>)}
    </div>, document.body)}
  </div>;
}
