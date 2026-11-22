import { useEffect, type ReactNode } from "react";
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
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 w-full max-w-[430px] rounded-t-3xl bg-card p-5 shadow-lg safe-bottom"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#e0e3e1]" />
        {title ? (
          <div className="mb-4 flex items-center justify-between">
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
        {children}
      </div>
    </div>
  );
}
