import { Link, useNavigate } from "react-router-dom";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Send,
} from "lucide-react";
import { Chip } from "@/components/Chip";
import { Disclaimer } from "@/components/Disclaimer";
import { Mascot } from "@/components/Mascot";
import { Toast } from "@/components/Toast";
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { SCH_ORIGIN } from "@/data/mock";
import { useGeolocation } from "@/hooks/useGeolocation";
import type {
  ChatMenuHitUi,
  ChatPlaceCandidateUi,
  ChatResultUi,
} from "@/lib/api/adapters";
import { ApiError } from "@/lib/api/errors";
import { getDataProvider } from "@/lib/api/providers";
import { CURRENT_LOCATION_QUESTION, SUGGESTED_QUESTIONS } from "@/lib/aiEngine";
import { navigateBack } from "@/lib/navBack";
import { useProfileStore } from "@/store/profileStore";

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; result: ChatResultUi; error?: string };

function profileConditionChips(
  allergens: string[],
  restrictions: string[],
): string[] {
  const chips = allergens.map(allergenLabel);
  if (restrictions.includes("beef")) chips.push("소고기 제외");
  else if (restrictions[0]) {
    chips.push(`${restrictionLabel(restrictions[0])} 제외`);
  }
  return chips;
}

function formatDistanceM(m: number | null): string {
  if (m == null) return "";
  if (m < 1000) return `${Math.round(m)}m · 직선거리`;
  return `${(m / 1000).toFixed(1)}km · 직선거리`;
}

function HitCard({
  hit,
  tone,
}: {
  hit: ChatMenuHitUi;
  tone: "match" | "check";
}) {
  const navigate = useNavigate();
  const distance = formatDistanceM(hit.distanceM);
  return (
    <div className="rounded-2xl border border-[#eef1ef] bg-card p-4">
      <p className="text-[15px] font-bold text-text">{hit.restaurantName}</p>
      {distance ? (
        <p className="mt-0.5 text-[12px] text-muted">{distance}</p>
      ) : null}
      <div className="mt-3">
        <Chip label={hit.menuName} variant="readonly" />
      </div>
      {hit.reason ? (
        <p
          className={`mt-3 text-[13px] leading-relaxed ${
            tone === "check"
              ? "font-semibold text-accent-text"
              : "text-muted"
          }`}
        >
          {hit.reason}
        </p>
      ) : null}
      {hit.menuId && tone === "match" ? (
        <Link
          to={`/menu/${hit.menuId}`}
          className="mt-3 inline-flex touch-target items-center gap-0.5 text-[13px] font-semibold text-primary"
        >
          메뉴 상세 보기
          <ChevronRight className="size-4" />
        </Link>
      ) : null}
      {hit.menuId && tone === "check" ? (
        <button
          type="button"
          onClick={() => navigate(`/show-staff?menuId=${hit.menuId}`)}
          className="mt-3 flex h-11 w-full touch-target items-center justify-center rounded-full bg-primary-light text-[13px] font-semibold text-primary"
        >
          직원에게 보여주기
        </button>
      ) : null}
    </div>
  );
}

export default function AiPage() {
  const navigate = useNavigate();
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);
  const geo = useGeolocation({ autoRequest: true });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** 대화 중 확정된 검색 좌표 (장소 선택 후 유지) */
  const [searchLocation, setSearchLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const defaultLocation = geo.position !== null
    ? { lat: geo.position!.lat, lng: geo.position!.lng }
    : { lat: SCH_ORIGIN.lat, lng: SCH_ORIGIN.lng };

  const conditionChips = useMemo(
    () => profileConditionChips(allergens, restrictions),
    [allergens, restrictions],
  );

  const started = messages.length > 0;
  const latestResult = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role === "assistant" && !message.error) {
        return message.result;
      }
    }
    return undefined;
  }, [messages]);
  const nextRadiusM = latestResult?.nextRadiusM;
  const activePlaceCandidates = latestResult?.placeCandidates ?? [];

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const send = async (
    text: string,
    options?: { location: { lat: number; lng: number } } | { radiusM: number },
  ) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: trimmed },
    ]);
    const locationOverride = options && "location" in options ? options.location : undefined;
    const location =
      locationOverride ?? searchLocation ?? defaultLocation;
    try {
      const result = await getDataProvider().postChat(
        options && "radiusM" in options
          ? { message: "", radius_m: options.radiusM }
          : { message: locationOverride ? "" : trimmed, location },
      );
      if (result.state?.location && typeof result.state.location === "object") {
        const loc = result.state.location as { lat?: unknown; lng?: unknown };
        if (typeof loc.lat === "number" && typeof loc.lng === "number") {
          setSearchLocation({ lat: loc.lat, lng: loc.lng });
        }
      }
      if (locationOverride) {
        setSearchLocation(locationOverride);
      }
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", result },
      ]);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "응답을 받지 못했습니다.";
      setToast(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          result: {
            message: msg,
            question: null,
            placeCandidates: [],
            matched: [],
            needsCheck: [],
            criteria: [],
            radiusM: null,
            state: {},
          },
          error: msg,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const selectPlace = (candidate: ChatPlaceCandidateUi) => {
    void send(`${candidate.name} 근처`, { location: candidate.location });
  };

  const sendSuggestedQuestion = (question: string) => {
    if (question !== CURRENT_LOCATION_QUESTION) {
      void send(question);
      return;
    }
    if (!geo.position) {
      setToast(geo.status === "loading"
        ? "현재 위치를 확인 중이에요. 잠시 후 다시 눌러 주세요."
        : "현재 위치를 사용할 수 없어요. 위치 권한을 확인하거나 장소 이름으로 검색해 주세요.");
      return;
    }
    const { lat, lng } = geo.position;
    void send(question, { location: { lat, lng } });
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-start gap-1 px-3 pt-4 pb-2">
        <button
          type="button"
          onClick={() => navigateBack(navigate, "/explore")}
          className="touch-target mt-0.5 inline-flex text-primary"
          aria-label="뒤로"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1 pr-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-[18px] font-bold leading-snug text-text">
              골라잇 AI 메뉴 추천
            </h1>
            <Mascot className="size-9 shrink-0" />
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {started
              ? activePlaceCandidates.length > 0
                ? "검색에 쓸 장소를 선택해 주세요."
                : "위치·식이 조건을 반영한 메뉴별 추천"
              : "자연어로 장소와 원하는 메뉴를 질문해 보세요."}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-3 scrollbar-hide">
        {!started && (
          <div className="space-y-5">
            <div className="flex gap-3 rounded-2xl bg-primary-light p-4">
              <Mascot className="size-12 shrink-0" />
              <div>
                <p className="text-[14px] font-bold text-primary">
                  내 식이 조건을 적용해 추천해드려요
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-text">
                  메뉴별 확인 정보와 미확인 내용을 구분하고 필요하면 직원에게
                  보여줄 문구도 만들어요.
                </p>
              </div>
            </div>

            <section>
              <p className="mb-2 text-[14px] font-bold text-text">
                현재 적용 중인 식이 조건
              </p>
              <div className="flex flex-wrap gap-2">
                {conditionChips.length === 0 ? (
                  <span className="text-[13px] text-muted">적용 조건 없음</span>
                ) : (
                  conditionChips.map((c) => (
                    <Chip key={c} label={c} variant="readonly" />
                  ))
                )}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[14px] font-bold text-text">
                이렇게 질문해 보세요
              </p>
              <div className="space-y-2">
                {SUGGESTED_QUESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={sending}
                    onClick={() => sendSuggestedQuestion(s)}
                    className="flex w-full touch-target items-center justify-between rounded-2xl border border-[#eef1ef] bg-card px-4 py-3.5 text-left text-[14px] text-text disabled:opacity-50"
                  >
                    <span className="pr-2">{s}</span>
                    <ChevronRight className="size-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m, index) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-[14px] text-white">
                    {m.text}
                  </p>
                </div>
              );
            }
            const isLatest = index === messages.length - 1;
            const showPlaces =
              isLatest && m.result.placeCandidates.length > 0 && !sending;
            return (
              <div key={m.id} className="space-y-3">
                <div className="rounded-2xl border border-[#eef1ef] bg-card p-4">
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">
                    {m.result.message}
                  </p>
                </div>

                {showPlaces ? (
                  <section className="space-y-2">
                    <p className="text-[14px] font-bold text-text">장소 선택</p>
                    {m.result.placeCandidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={sending}
                        onClick={() => selectPlace(c)}
                        className="flex w-full touch-target items-start gap-3 rounded-2xl border border-[#eef1ef] bg-card px-4 py-3.5 text-left disabled:opacity-50"
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-text">
                            {c.name}
                          </span>
                          {c.address ? (
                            <span className="mt-0.5 block text-[12px] text-muted">
                              {c.address}
                            </span>
                          ) : null}
                        </span>
                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-primary" />
                      </button>
                    ))}
                  </section>
                ) : null}

                {m.result.matched.length > 0 ? (
                  <section className="space-y-2">
                    <div className="flex items-center gap-1.5 text-primary">
                      <CheckCircle2 className="size-5" strokeWidth={2.25} />
                      <h3 className="text-[15px] font-bold">식이조건 일치</h3>
                    </div>
                    {m.result.matched.map((hit) => (
                      <HitCard
                        key={`${hit.restaurantId}-${hit.menuId}-m`}
                        hit={hit}
                        tone="match"
                      />
                    ))}
                  </section>
                ) : null}

                {m.result.needsCheck.length > 0 ? (
                  <section className="space-y-2">
                    <div className="flex items-center gap-1.5 text-accent-text">
                      <AlertTriangle className="size-5" strokeWidth={2.25} />
                      <h3 className="text-[15px] font-bold">추가 확인 필요</h3>
                    </div>
                    {m.result.needsCheck.map((hit) => (
                      <HitCard
                        key={`${hit.restaurantId}-${hit.menuId}-c`}
                        hit={hit}
                        tone="check"
                      />
                    ))}
                  </section>
                ) : null}
              </div>
            );
          })}
          {nextRadiusM !== undefined ? (
            <button
              type="button"
              disabled={sending}
              onClick={() => void send(
                `범위 넓히기 · ${nextRadiusM / 1000}km로 검색`,
                { radiusM: nextRadiusM },
              )}
              className="w-full touch-target rounded-2xl border border-[#eef1ef] bg-card px-4 py-3.5 text-[14px] font-semibold text-primary disabled:opacity-50"
            >
              범위 넓히기 · {nextRadiusM / 1000}km로 검색
            </button>
          ) : null}
          {sending ? (
            <p className="text-center text-[13px] text-muted">답변 준비 중…</p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[#eef1ef] bg-background px-4 pt-3 safe-bottom">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send(input);
            }}
            placeholder={
              activePlaceCandidates.length > 0
                ? "장소를 탭하거나 직접 입력"
                : "메뉴나 장소를 물어보세요"
            }
            disabled={sending}
            className="h-12 flex-1 rounded-full border border-[#e5e8e6] bg-card px-4 text-[14px] outline-none placeholder:text-muted disabled:opacity-50"
            aria-label="AI 질문 입력"
          />
          <button
            type="button"
            disabled={sending || !input.trim()}
            onClick={() => void send(input)}
            className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-white touch-target disabled:opacity-40"
            aria-label="전송"
          >
            <Send className="size-5" />
          </button>
        </div>
        <div className="mt-2 pb-1">
          <Disclaimer text="메뉴 정보는 교차접촉 안전을 보증하지 않습니다." />
        </div>
      </div>

      <Toast message={toast ?? ""} visible={Boolean(toast)} />
    </main>
  );
}
