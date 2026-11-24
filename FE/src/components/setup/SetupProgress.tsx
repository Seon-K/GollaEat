interface SetupProgressProps {
  step: 1 | 2 | 3;
  /** STEP 라벨 옆 부가 문구 (예: 채식 및 제한 식재료) */
  stepSuffix?: string;
  /** 제목·설명 아래에 바만 렌더할 때 */
  barOnly?: boolean;
}

export function SetupStepLabel({
  step,
  stepSuffix,
}: {
  step: 1 | 2 | 3;
  stepSuffix?: string;
}) {
  return (
    <p className="text-[13px] font-bold text-primary">
      STEP {step} / 3{stepSuffix ? ` · ${stepSuffix}` : ""}
    </p>
  );
}

export function SetupProgressBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[#e5e8e6]">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${(step / 3) * 100}%` }}
      />
    </div>
  );
}

export function SetupProgress({ step, stepSuffix, barOnly }: SetupProgressProps) {
  if (barOnly) return <SetupProgressBar step={step} />;
  return (
    <div>
      <SetupStepLabel step={step} stepSuffix={stepSuffix} />
      <div className="mt-4">
        <SetupProgressBar step={step} />
      </div>
    </div>
  );
}
