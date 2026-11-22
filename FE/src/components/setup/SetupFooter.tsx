import type { ReactNode } from "react";
import { PrimaryButton } from "@/components/PrimaryButton";

export function SetupFooter({
  onNext,
  nextLabel,
  hint,
}: {
  onNext: () => void;
  nextLabel: string;
  hint?: ReactNode;
}) {
  return (
    <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-transparent bg-background px-5 pt-3 safe-bottom">
      {hint ? <div className="mb-3">{hint}</div> : null}
      <PrimaryButton onClick={onNext}>{nextLabel}</PrimaryButton>
    </div>
  );
}
