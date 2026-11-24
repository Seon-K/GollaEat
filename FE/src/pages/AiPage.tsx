import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Send,
  Utensils,
} from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Chip } from "@/components/Chip";
import { Disclaimer } from "@/components/Disclaimer";
import { MenuCard } from "@/components/MenuCard";
import { Mascot } from "@/components/Mascot";
import { Toast } from "@/components/Toast";
import { allergenLabel } from "@/data/allergens";
import { restrictionLabel } from "@/data/restrictions";
import { SCH_ORIGIN } from "@/data/mock";
import { useGeolocation } from "@/hooks/chatbot/useGeolocation";
import { LocationError } from "@/hooks/useGeolocation";
import { useFavorites } from "@/hooks/useFavoriteToggle";
import type {
  ChatMenuHitUi,
  ChatPlaceCandidateUi,
  ChatResultUi,
} from "@/lib/api/adapters";
import { apiGet } from "@/lib/api/client";
import type { ApiMenusResponse } from "@/lib/api/types";
import { ApiError } from "@/lib/api/errors";
import { getDataMode, getDataProvider } from "@/lib/api/providers";
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

async function getRestaurantMenuPrices(restaurantId: string, signal: AbortSignal) {
  const prices = new Map<string, number>();
  let page: number | null = 1;
  while (page !== null) {
    const response: ApiMenusResponse = await apiGet<ApiMenusResponse>("/api/menus", {
      restaurant_id: restaurantId,
      personalize: false,
      limit: 100,
      page,
    }, { signal });
    for (const menu of response.results) {
      const amount = menu.price?.amount;
      if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) {
        prices.set(menu.menu_id, amount);
      }
    }
    page = response.pagination.next_page;
  }
  return prices;
}

function ChatRestaurantMenus({
  matched,
  needsCheck,
  prices,
}: {
  matched: ChatMenuHitUi[];
  needsCheck: ChatMenuHitUi[];
  prices?: Map<string, number>;
}) {
  const favorites = useFavorites();

  function renderMenu(hit: ChatMenuHitUi, status: "match" | "check") {
    const priceAmount = prices?.get(hit.menuId) ?? null;
    const note = hit.reason === "확인된 정보상 식이 조건 일치" ? undefined : hit.reason;
    return (
      <MenuCard
        key={`${status}-${hit.menuId || hit.menuName}`}
        variant="chat"
        item={{
          id: hit.menuId,
          name: hit.menuName,
          restaurantName: hit.restaurantName,
          priceAmount,
          distanceKm: null,
          status,
          saved: favorites.isSaved(hit.menuId),
        }}
        note={note}
        saving={favorites.isSaving(hit.menuId)}
        onToggleSave={hit.menuId && !favorites.isLoading && !favorites.isError
          ? () => favorites.toggleSave(hit.menuId, priceAmount === null ? undefined : {
            id: hit.menuId,
            name: hit.menuName,
            restaurantName: hit.restaurantName,
            priceAmount,
          })
          : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      {matched.map((hit) => renderMenu(hit, "match"))}
      {needsCheck.map((hit) => renderMenu(hit, "check"))}
      <Toast message={favorites.saveError ?? ""} visible={!!favorites.saveError} />
    </div>
  );
}

function ChatRestaurants({ result }: { result: ChatResultUi }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const restaurants = useMemo(() => {
    const groups = new Map<string, {
      id: string; name: string; distance: number | null;
      matched: ChatMenuHitUi[]; needsCheck: ChatMenuHitUi[];
    }>();
    for (const kind of ["matched", "needsCheck"] as const) {
      for (const hit of result[kind]) {
        const id = hit.restaurantId || `${hit.restaurantName}:${hit.distanceM}`;
        let group = groups.get(id);
        if (!group) {
          group = { id, name: hit.restaurantName, distance: hit.distanceM, matched: [], needsCheck: [] };
          groups.set(id, group);
        }
        group[kind].push(hit);
      }
    }
    return [...groups.values()].sort((a, b) =>
      Number(b.matched.length > 0) - Number(a.matched.length > 0)
      || (a.distance ?? Infinity) - (b.distance ?? Infinity)
      || a.id.localeCompare(b.id));
  }, [result]);
  const selected = restaurants.find((restaurant) => restaurant.id === selectedId);
  const restaurantId = selected?.matched[0]?.restaurantId ?? selected?.needsCheck[0]?.restaurantId;
  const { data: prices } = useQuery({
    queryKey: ["chat-restaurant-menu-prices", restaurantId],
    queryFn: ({ signal }) => getRestaurantMenuPrices(restaurantId!, signal),
    enabled: getDataMode() === "api" && Boolean(restaurantId),
  });
  return <>
    <div className="space-y-3">
      {restaurants.map((restaurant) => <article key={restaurant.id}
        className="rounded-2xl border border-border bg-card shadow-sm">
        <button type="button" aria-label={`${restaurant.name} 메뉴 보기`} aria-haspopup="dialog"
          onClick={() => setSelectedId(restaurant.id)}
          className="flex w-full items-start gap-3 rounded-2xl p-4 text-left hover:bg-primary-light/40">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary">
            <Utensils className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-text">{restaurant.name}</span>
            <span className="mt-1 block text-xs text-muted">{formatDistanceM(restaurant.distance)}</span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status="match" title={`일치 ${restaurant.matched.length}개`} />
              <StatusBadge status="check" title={`추가 확인 필요 ${restaurant.needsCheck.length}개`} />
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted" />
        </button>
      </article>)}
    </div>
    <BottomSheet open={!!selected} onClose={() => setSelectedId(null)} title={selected?.name}>
      {selected && (
        <ChatRestaurantMenus matched={selected.matched} needsCheck={selected.needsCheck} prices={prices} />
      )}
    </BottomSheet>
  </>;

}

export default function AiPage() {
  const navigate = useNavigate();
  const allergens = useProfileStore((s) => s.allergens);
  const restrictions = useProfileStore((s) => s.restrictions);
  const geo = useGeolocation();
  const locationDialog = useRef<HTMLDialogElement>(null);
  const [locationPrompt, setLocationPrompt] = useState<"request" | "pending" | "denied" | "unavailable">("request");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** 대화 중 확정된 검색 좌표 (장소 선택 후 유지) */
  const [searchLocation, setSearchLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const defaultLocation = geo.location.isGps
    ? { lat: geo.location.lat, lng: geo.location.lng }
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

  const submitQuestion = (question: string) => {
    if (question.trim() !== CURRENT_LOCATION_QUESTION) {
      void send(question);
      return;
    }
    if (sending) return;
    if (geo.location.isGps) {
      const { lat, lng } = geo.location;
      void send(CURRENT_LOCATION_QUESTION, { location: { lat, lng } });
    } else if (geo.status === "pending") {
      setToast("현재 위치를 확인 중이에요. 잠시 후 다시 눌러 주세요.");
    } else {
      setLocationPrompt("request");
      locationDialog.current?.showModal();
    }
  };

  const retryLocation = async () => {
    setLocationPrompt("pending");
    try {
      const { lat, lng } = await geo.refresh();
      if (!locationDialog.current?.open) return;
      locationDialog.current.close();
      void send(CURRENT_LOCATION_QUESTION, { location: { lat, lng } });
    } catch (error) {
      if (!locationDialog.current?.open) return;
      setLocationPrompt(error instanceof LocationError && error.status === "denied" ? "denied" : "unavailable");
    }
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
                    onClick={() => submitQuestion(s)}
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

                <ChatRestaurants result={m.result} />
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
              if (e.key === "Enter") submitQuestion(input);
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
            onClick={() => submitQuestion(input)}
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

      <dialog
        ref={locationDialog}
        aria-labelledby="chat-location-title"
        aria-describedby="chat-location-description"
        onCancel={(event) => { if (locationPrompt === "pending") event.preventDefault(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-card p-5 text-text shadow-lg backdrop:bg-black/40"
      >
        <h2 id="chat-location-title" className="text-base font-bold">현재 위치 사용</h2>
        <p id="chat-location-description" aria-live="polite" className="mt-2 text-sm leading-relaxed text-muted">
          {locationPrompt === "request" && "내 위치 주변 메뉴를 찾으려면 위치 권한을 허용해 주세요."}
          {locationPrompt === "pending" && "현재 위치를 확인하고 있어요."}
          {locationPrompt === "denied" && "위치 권한이 꺼져 있어요. 브라우저의 사이트 설정에서 위치를 허용하거나, 장소 이름으로 검색해 주세요."}
          {locationPrompt === "unavailable" && "현재 위치를 가져오지 못했어요. 기기의 위치 설정을 확인하거나, 장소 이름으로 검색해 주세요."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={locationPrompt === "pending"} onClick={() => locationDialog.current?.close()}
            className="touch-target rounded-full px-4 text-sm font-semibold text-muted disabled:opacity-50">
            {locationPrompt === "request" || locationPrompt === "pending" ? "취소" : "닫기"}
          </button>
          {(locationPrompt === "request" || locationPrompt === "pending") && (
            <button type="button" disabled={locationPrompt === "pending"} onClick={() => void retryLocation()}
              className="touch-target rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
              위치 권한 요청
            </button>
          )}
        </div>
      </dialog>
      <Toast message={toast ?? ""} visible={Boolean(toast)} />
    </main>
  );
}
