"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
}

export function SecondaryButton({
  children,
  className = "",
  ...rest
}: SecondaryButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-[28px] bg-primary-light px-5 text-[16px] font-semibold text-primary touch-target transition-opacity disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
