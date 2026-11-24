import { Check, X } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type ChipVariant = "default" | "selected" | "removable" | "readonly";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  label: string;
  variant?: ChipVariant;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function Chip({
  label,
  variant,
  selected = false,
  onClick,
  onRemove,
  className = "",
  disabled,
  ...rest
}: ChipProps) {
  const resolved: ChipVariant =
    variant ??
    (onRemove ? "removable" : selected ? "selected" : "default");

  const isSelected =
    resolved === "selected" || resolved === "removable" || selected;

  const tone =
    resolved === "readonly" || isSelected
      ? "bg-primary-light text-primary border-transparent"
      : "bg-card text-text border-border-strong";

  const baseClass = `inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-full text-[14px] font-medium border transition-colors ${tone} ${className}`;

  if (resolved === "readonly") {
    return (
      <span className={`${baseClass} min-h-0 py-1.5 text-[13px]`}>
        <span>{label}</span>
      </span>
    );
  }

  if (resolved === "removable") {
    return (
      <span className={`${baseClass} min-h-0 py-1.5 text-[13px]`}>
        <span>{label}</span>
        {onRemove ? (
          <button
            type="button"
            aria-label={`${label} 제거`}
            onClick={onRemove}
            disabled={disabled}
            className="inline-flex size-6 items-center justify-center rounded-full"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} touch-target`}
      {...rest}
    >
      <span>{label}</span>
      {resolved === "selected" && (
        <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      )}
    </button>
  );
}

/** readonly Chip 별칭 */
export function TagChip({ label }: { label: string }) {
  return <Chip label={label} variant="readonly" />;
}
