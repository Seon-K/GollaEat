import type { JudgementStatus } from "@/types";

export const VERDICT_COPY: Record<
  JudgementStatus,
  { title: string; description: string }
> = {
  match: {
    title: "식이조건 일치",
    description: "확인된 재료 정보상 조건에 부합합니다.",
  },
  check: {
    title: "추가 확인 필요",
    description: "육수·소스 등 미확인 항목이 있습니다.",
  },
  mismatch: {
    title: "식이조건 불일치",
    description: "제한 성분이 확인된 메뉴입니다.",
  },
};
