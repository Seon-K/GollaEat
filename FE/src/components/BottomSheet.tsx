import { useSheetResize } from "@/hooks/useSheetResize";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const [resized, setResized] = useState(false);
  const resize = useSheetResize(sheetRef, [25, 60, 90]);
  useEffect(() => {
    if (!open) return;
    setResized(false);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", escape);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 flex max-h-[90dvh] w-full max-w-[430px] flex-col rounded-t-3xl bg-card px-5 pb-5 shadow-lg safe-bottom transition-[height] duration-200 motion-reduce:transition-none"
        style={{ height: resized || resize.dragging ? resize.height : undefined, transitionDuration: resize.dragging ? "0ms" : undefined }}
      >
        <button type="button" aria-label="시트 높이 조절" className="flex h-10 w-full shrink-0 touch-none cursor-ns-resize items-center justify-center"
          {...resize.handleProps} onClick={() => { setResized(true); resize.handleProps.onClick(); }}
          onPointerUp={(event) => { setResized(true); resize.handleProps.onPointerUp(event); }}
          onKeyDown={(event) => { if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) setResized(true); resize.handleProps.onKeyDown(event); }}>
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </button>
        {title ? (
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <h2 className="text-[17px] font-bold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center text-muted touch-target"
              aria-label="닫기"
            >
              <X className="size-5" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
