import { ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** 우측 chevron 표시 (온보딩 '다음' 등) */
  showChevron?: boolean;
  className?: string;
}

export function PrimaryButton({
  children,
  showChevron = false,
  className = "",
  ...rest
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-[28px] bg-primary px-5 text-[16px] font-semibold text-white touch-target transition-opacity disabled:opacity-50 ${
        showChevron ? "relative" : ""
      } ${className}`}
      {...rest}
    >
      <span className={showChevron ? "flex-1 text-center" : ""}>{children}</span>
      {showChevron ? (
        <ChevronRight
          className="absolute right-5 size-5 shrink-0"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
