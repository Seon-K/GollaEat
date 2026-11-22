"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, MessageCircle, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Chip } from "@/components/Chip";
import { ClocheIcon } from "@/components/ClocheIcon";
import { Disclaimer } from "@/components/Disclaimer";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusBadge } from "@/components/StatusBadge";

const SLIDES = [
  {
    step: "01 / 03 · 나의 조건 설정",
    title: "나에게 맞는 식사 조건부터",
    desc: "알레르기와 먹지 않는 식재료를 직접 골라 나만의 식이 프로필을 만들어요.",
    visual: "profile" as const,
  },
  {
    step: "02 / 03 · 메뉴별 판단",
    title: "식당보다 메뉴를 먼저 확인",
    desc: "메뉴별 재료와 내 식이 조건을 비교해 판단 결과와 근거를 한눈에 확인해요.",
    visual: "menu" as const,
  },
  {
    step: "03 / 03 · 확인과 선택",
    title: "궁금한 재료는 확인하고 선택",
    desc: "확인되지 않은 정보는 따로 표시하고 매장 문의까지 도와드려요.",
    visual: "check" as const,
  },
] as const;

const SWIPE_THRESHOLD = 48;

function SlideVisual({ visual }: { visual: (typeof SLIDES)[number]["visual"] }) {
  if (visual === "profile") {
    return (
      <div className="w-full max-w-[268px] rounded-2xl bg-card p-5 shadow-[0_4px_20px_rgba(37,42,39,0.06)]">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="size-5" strokeWidth={2.25} />
          <p className="text-[15px] font-bold">나의 식이 조건</p>
        </div>
        <p className="mt-3 text-[12px] text-muted">알레르겐</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip label="땅콩" variant="readonly" />
          <Chip label="우유" variant="readonly" />
          <span className="inline-flex items-center rounded-full border border-[#e5e8e6] bg-card px-3 py-1.5 text-[13px] font-medium text-text">
            새우
          </span>
        </div>
        <p className="mt-4 text-center text-[12px] text-muted">
          제한 식재료도 자유롭게 선택
        </p>
      </div>
    );
  }

  if (visual === "menu") {
    return (
      <div className="w-full max-w-[268px] rounded-2xl bg-card p-5 shadow-[0_4px_20px_rgba(37,42,39,0.06)]">
        <ClocheIcon className="size-5 text-primary" />
        <p className="mt-3 text-[16px] font-bold text-text">버섯 샐러드</p>
        <p className="mt-1 text-[13px] text-muted">그린키친 · 9,900원</p>
        <div className="mt-3">
          <StatusBadge status="match" variant="pill" />
        </div>
        <p className="mt-3 text-[12px] text-muted">재료·알레르겐 및 판단 근거 확인</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[268px] space-y-3 rounded-2xl bg-card p-5 shadow-[0_4px_20px_rgba(37,42,39,0.06)]">
      <div className="flex items-start gap-2.5">
        <HelpCircle
          className="mt-0.5 size-6 shrink-0 text-accent"
          strokeWidth={2}
          aria-hidden
        />
        <div>
          <p className="text-[16px] font-bold text-text">추가 확인 필요</p>
          <p className="mt-1 text-[13px] text-muted">소스·육수 등 미확인 재료</p>
        </div>
      </div>
      <div className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-primary-light text-[13px] font-semibold text-primary">
        <MessageCircle className="size-4" />
        매장에 문의하기
      </div>
      <p className="text-center text-[12px] text-muted">확인된 정보만 근거로 안내</p>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(true);
  const touchX = useRef<number | null>(null);

  const goSetup = useCallback(() => {
    router.push("/setup/allergen");
  }, [router]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= SLIDES.length) return;
      setAnimating(true);
      setDragX(0);
      setIndex(next);
    },
    [],
  );

  const next = () => {
    if (index >= SLIDES.length - 1) goSetup();
    else goTo(index + 1);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    setAnimating(false);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    setDragX(e.touches[0].clientX - touchX.current);
  };

  const onTouchEnd = () => {
    if (touchX.current == null) return;
    const dx = dragX;
    touchX.current = null;
    setAnimating(true);

    if (dx <= -SWIPE_THRESHOLD && index < SLIDES.length - 1) {
      setDragX(0);
      setIndex((i) => i + 1);
      return;
    }
    if (dx >= SWIPE_THRESHOLD && index > 0) {
      setDragX(0);
      setIndex((i) => i - 1);
      return;
    }
    setDragX(0);
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background px-5 pb-6 pt-2">
      <header className="flex h-12 items-center justify-between">
        <BrandMark />
        <button
          type="button"
          onClick={goSetup}
          className="touch-target inline-flex items-center text-[14px] text-muted"
        >
          건너뛰기
        </button>
      </header>

      <div
        className="mt-3 flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`flex h-full ${animating ? "transition-transform duration-300 ease-out" : ""}`}
          style={{
            width: `${SLIDES.length * 100}%`,
            transform: `translateX(calc(-${(index * 100) / SLIDES.length}% + ${dragX}px))`,
          }}
        >
          {SLIDES.map((slide) => (
            <div
              key={slide.step}
              className="flex flex-col px-0.5"
              style={{ width: `${100 / SLIDES.length}%` }}
            >
              <div className="flex min-h-[248px] items-center justify-center rounded-[28px] bg-primary-light p-5">
                <SlideVisual visual={slide.visual} />
              </div>

              <p className="mt-7 text-[13px] font-semibold text-primary">
                {slide.step}
              </p>
              <h1 className="mt-2 text-[24px] font-bold leading-snug text-text">
                {slide.title}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                {slide.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}번째 슬라이드`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-6 bg-primary" : "w-1.5 bg-[#d5dad7]"
            }`}
          />
        ))}
      </div>

      <div className="mt-5 space-y-3 safe-bottom">
        <PrimaryButton onClick={next} showChevron>
          {index === SLIDES.length - 1 ? "시작하기" : "다음"}
        </PrimaryButton>
        <Disclaimer text="메뉴별 재료 정보에 기반하며 교차접촉 안전을 보증하지 않습니다." />
      </div>
    </main>
  );
}
