"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Chip } from "@/components/Chip";
import { Disclaimer } from "@/components/Disclaimer";
import { Dropdown } from "@/components/Dropdown";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Wordmark } from "@/components/Wordmark";
import { MascotLogo } from "@/components/MascotLogo";

const PALETTE = [
  { name: "Primary", hex: "#2F7D5A", className: "bg-primary" },
  { name: "Primary Light", hex: "#E7F3EC", className: "bg-primary-light" },
  { name: "Accent", hex: "#F59E42", className: "bg-accent" },
  { name: "Accent Light", hex: "#FFF1DF", className: "bg-accent-light" },
  { name: "Background", hex: "#FAFAF7", className: "bg-background border border-[#e5e8e6]" },
  { name: "Text", hex: "#252A27", className: "bg-text" },
  { name: "Muted", hex: "#737A76", className: "bg-muted" },
  { name: "Error", hex: "#D94C4C", className: "bg-error" },
] as const;

export default function DesignSystemPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sort, setSort] = useState("recommend");
  const [chips, setChips] = useState(["땅콩", "우유", "새우"]);

  return (
    <main className="min-h-[100dvh] bg-background px-5 pb-16">
      <header className="pt-2 pb-6">
        <h1 className="text-[22px] font-bold">
          <span className="text-primary">골라잇</span>{" "}
          <span className="text-text">GollaEat</span>
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          BRAND PALETTE / 모바일 식이 제한 맞춤 메뉴 추천
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-bold text-text">로고 · p17</h2>
        <Wordmark />
        <div className="mt-4 flex items-end gap-4">
          <div className="text-center">
            <MascotLogo framed className="size-20" />
            <p className="mt-2 text-[11px] text-muted">앱 아이콘</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-bold text-text">색상 토큰 · p01</h2>
        <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
          {PALETTE.map((c) => (
            <div key={c.hex} className="text-center min-w-0">
              <div className={`mx-auto aspect-square w-full rounded-lg ${c.className}`} />
              <p className="mt-1 text-[9px] font-medium text-text leading-tight truncate">
                {c.name}
              </p>
              <p className="text-[8px] text-muted leading-tight">{c.hex}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="aspect-[2/1] rounded-xl bg-primary-dark" />
            <p className="mt-1 text-[10px] font-medium">primary-dark</p>
            <p className="text-[10px] text-muted">#1A4D38</p>
          </div>
          <div className="text-center">
            <div className="aspect-[2/1] rounded-xl bg-error-light border border-[#f0d4d4]" />
            <p className="mt-1 text-[10px] font-medium">error-light</p>
            <p className="text-[10px] text-muted">#FCEBEB</p>
          </div>
          <div className="text-center">
            <div className="flex aspect-[2/1] items-center justify-center rounded-xl bg-accent-light">
              <span className="text-[12px] font-bold text-accent-text">Aa</span>
            </div>
            <p className="mt-1 text-[10px] font-medium">accent-text</p>
            <p className="text-[10px] text-muted">#B8691A</p>
          </div>
        </div>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-[15px] font-bold text-text">판정 상태 · 공통 UI</h2>
        <StatusBadge status="match" variant="panel" />
        <StatusBadge status="check" variant="panel" />
        <StatusBadge status="mismatch" variant="panel" />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-bold text-text">StatusBadge · pill</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="match" variant="pill" />
          <StatusBadge status="check" variant="pill" />
          <StatusBadge status="mismatch" variant="pill" />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-bold text-text">Chip</h2>
        <div className="flex flex-wrap gap-2">
          <Chip label="난류" variant="default" onClick={() => undefined} />
          <Chip label="우유" variant="selected" onClick={() => undefined} />
          {chips.map((c) => (
            <Chip
              key={c}
              label={c}
              variant="removable"
              onRemove={() => setChips((prev) => prev.filter((x) => x !== c))}
            />
          ))}
          <Chip label="땅콩" variant="readonly" />
        </div>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-[15px] font-bold text-text">Button</h2>
        <PrimaryButton>시작하기</PrimaryButton>
        <PrimaryButton showChevron>다음</PrimaryButton>
        <SecondaryButton>매장에 문의하기</SecondaryButton>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-[15px] font-bold text-text">Dropdown / BottomSheet</h2>
        <Dropdown
          label="정렬"
          value={sort}
          onChange={setSort}
          options={[
            { id: "recommend", label: "추천순" },
            { id: "match", label: "일치순" },
            { id: "price_asc", label: "낮은 가격순" },
          ]}
        />
        <SecondaryButton onClick={() => setSheetOpen(true)}>
          BottomSheet 열기
        </SecondaryButton>
      </section>

      <Disclaimer text="메뉴별 재료 정보에 기반하며 교차접촉 안전을 보증하지 않습니다." />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="필터"
      >
        <div className="flex flex-wrap gap-2 pb-2">
          {["전체", "한식", "중식", "일식", "양식"].map((f) => (
            <Chip key={f} label={f} variant="default" onClick={() => setSheetOpen(false)} />
          ))}
        </div>
      </BottomSheet>
    </main>
  );
}
