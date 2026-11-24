import { UserRoundCheck } from "lucide-react";
import { BRAND_NAME } from "@/assets/brand";

/** p03: 「골라잇」 텍스트 뒤에 사람+체크 아이콘 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[18px] font-bold text-primary ${className}`}
    >
      <span>{BRAND_NAME}</span>
      <UserRoundCheck className="size-5" strokeWidth={2.25} aria-hidden />
    </div>
  );
}
