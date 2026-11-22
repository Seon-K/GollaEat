"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface ExploreSelectOption {
  id: string;
  label: string;
}

interface ExploreSelectProps {
  triggerLabel: string;
  triggerIcon?: ReactNode;
  options: ExploreSelectOption[];
  value: string;
  onChange: (id: string) => void;
  align?: "left" | "right";
  className?: string;
}

/** 탐색 화면 필터/정렬 드롭다운 (p18·p19) — 왼쪽 라디오 */
export function ExploreSelect({
  triggerLabel,
  triggerIcon,
  options,
  value,
  onChange,
  align = "left",
  className = "",
}: ExploreSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = `explore-select-${triggerLabel}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={triggerLabel}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong bg-card px-3.5 text-[13px] font-medium text-text shadow-sm touch-target"
      >
        {triggerIcon}
        {triggerLabel}
        <ChevronDown
          className={`size-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={listId}
          className={`absolute top-[calc(100%+6px)] z-40 min-w-[160px] overflow-hidden rounded-2xl border border-border-strong bg-card py-1 shadow-[0_8px_24px_rgba(37,42,39,0.1)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="listbox"
          aria-label={triggerLabel}
        >
          {options.map((opt, index) => {
            const active = opt.id === value;
            return (
              <li
                key={opt.id}
                role="option"
                aria-selected={active}
                className={
                  index < options.length - 1
                    ? "border-b border-border"
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[14px] text-text touch-target"
                >
                  <span
                    className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                      active
                        ? "border-primary"
                        : "border-[#c5cbc7]"
                    }`}
                    aria-hidden
                  >
                    {active ? (
                      <span className="size-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <span className={active ? "font-semibold text-text" : ""}>
                    {opt.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
