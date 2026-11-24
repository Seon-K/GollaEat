import { Link } from "react-router-dom";

import { Bookmark } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDistance, formatPrice } from "@/lib/geo";
import type { JudgementStatus } from "@/types";

/** 탐색·저장 목록 공통 카드 모델 (서버/어댑터 기준) */
export interface MenuCardModel {
  id: string;
  name: string;
  restaurantName: string;
  priceAmount: number;
  distanceKm: number | null;
  status: JudgementStatus;
  saved: boolean;
}

interface MenuCardProps {
  item: MenuCardModel;
  variant?: "explore" | "saved";
  onToggleSave?: () => void;
  saving?: boolean;
  onDetailIntent?: () => void;
}

export function MenuCard({
  item,
  variant = "explore",
  onToggleSave,
  saving,
  onDetailIntent,
}: MenuCardProps) {
  const distanceLabel =
    item.distanceKm != null
      ? `${formatDistance(item.distanceKm, "km")} 직선거리`
      : null;

  return (
    <div className="relative rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(37,42,39,0.03)]">
      <Link
        onPointerEnter={onDetailIntent}
        onFocus={onDetailIntent}
        onPointerDown={onDetailIntent}
        to={
          variant === "saved" ? `/menu/${item.id}?from=my` : `/menu/${item.id}`
        }
        className="block pr-10"
      >
        {variant === "saved" ? (
          <div className="flex items-start justify-between gap-2 pr-1">
            <div className="min-w-0 flex-1">
              <h3 className="text-[17px] font-bold text-text">{item.name}</h3>
              <p className="mt-1 text-[13px] text-muted">{item.restaurantName}</p>
              <p className="mt-1 text-[15px] font-bold text-text">
                {formatPrice(item.priceAmount)}
              </p>
            </div>
            <StatusBadge
              status={item.status}
              variant="pill"
              className="mt-0.5 mr-6 shrink-0"
            />
          </div>
        ) : (
          <>
            <h3 className="text-[17px] font-bold text-text">{item.name}</h3>
            <p className="mt-1 text-[13px] text-muted">
              {item.restaurantName} · {formatPrice(item.priceAmount)}
              {distanceLabel ? ` · ${distanceLabel}` : ""}
            </p>
            <div className="mt-3">
              <StatusBadge status={item.status} variant="pill" />
            </div>
          </>
        )}
      </Link>
      {onToggleSave ? (
        <button
          type="button"
          aria-label={item.saved ? "저장 해제" : "메뉴 저장"}
          aria-busy={saving}
          aria-pressed={item.saved}
          onClick={onToggleSave}
          className="absolute top-3 right-3 inline-flex items-center justify-center text-primary touch-target"
        >
          <Bookmark
            className="size-5"
            fill={item.saved ? "currentColor" : "none"}
            strokeWidth={1.8}
          />
        </button>
      ) : null}
    </div>
  );
}
