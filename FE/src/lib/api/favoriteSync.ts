import type { QueryClient } from "@tanstack/react-query";
import type { ApiFavorite } from "./types";
import { apiKeys } from "./keys";

export const FAVORITE_DEBOUNCE_MS = 400;
interface FavoriteApi {
  getFavorites(): Promise<ApiFavorite[]>;
  addFavorite(menuId: string): Promise<{ id: number; menuId: string }>;
  removeFavorite(id: number): Promise<void>;
}
export interface FavoritePreview {
  id: string; name: string; restaurantName: string; priceAmount: number; saved?: boolean;
}
interface Entry {
  menuId: string; desired: boolean; confirmed: boolean; favorite?: ApiFavorite;
  preview?: FavoritePreview; inFlight: boolean; due: number; timer?: ReturnType<typeof setTimeout>;
}

/** One queue per QueryClient, shared across pages; requests serialize per menu. */
export class FavoriteSync {
  version = 0;
  error: string | null = null;
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private refresh?: ReturnType<typeof setTimeout>;
  private errorTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;

  constructor(private client: QueryClient, private api: () => FavoriteApi) {
    client.getQueryCache().subscribe((event) => {
      if (event.type === "removed" && event.query.queryKey[1] === "favorites") this.reset();
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  snapshot = () => this.version;
  private emit() { this.version++; this.listeners.forEach((listener) => listener()); }
  private cached() { return this.client.getQueryData<ApiFavorite[]>(apiKeys.favorites()); }
  private live(entry: Entry, generation: number) {
    return generation === this.generation && this.entries.get(entry.menuId) === entry;
  }
  reset() {
    this.generation++;
    this.entries.forEach((entry) => clearTimeout(entry.timer));
    clearTimeout(this.refresh); clearTimeout(this.errorTimer);
    this.entries.clear(); this.error = null; this.emit();
  }
  isSaving(menuId: string) { return this.entries.has(menuId); }
  isSaved(menuId: string, fallback = false) {
    return this.entries.get(menuId)?.desired ?? (this.cached()?.some((item) => item.menu_id === menuId) ?? fallback);
  }
  favorites(base: ApiFavorite[]) {
    const result = new Map(base.map((item) => [item.menu_id, item]));
    this.entries.forEach((entry) => {
      if (entry.desired) result.set(entry.menuId, result.get(entry.menuId) ?? this.record(entry));
      // Keep an existing card clickable while removal is queued/in flight.
      else if (entry.favorite) result.set(entry.menuId, entry.favorite);
      else result.delete(entry.menuId);
    });
    return [...result.values()];
  }
  private record(entry: Entry): ApiFavorite {
    return entry.favorite ?? { id: -1, menu_id: entry.menuId, menu: entry.preview ? {
      menu_id: entry.menuId, menu_name: entry.preview.name,
      restaurant: { restaurant_id: "", restaurant_name: entry.preview.restaurantName },
      price: { amount: entry.preview.priceAmount, currency: "KRW" },
    } : undefined };
  }
  toggle(menuId: string, preview?: FavoritePreview) {
    clearTimeout(this.refresh); clearTimeout(this.errorTimer); this.error = null;
    let entry = this.entries.get(menuId);
    if (entry) entry.desired = !entry.desired;
    else {
      const favorite = this.cached()?.find((item) => item.menu_id === menuId);
      const confirmed = this.cached() ? !!favorite : !!preview?.saved;
      entry = { menuId, favorite, confirmed, desired: !confirmed, preview, inFlight: false, due: 0 };
      this.entries.set(menuId, entry);
    }
    entry.due = Date.now() + FAVORITE_DEBOUNCE_MS;
    this.schedule(entry);
    this.emit();
  }
  private schedule(entry: Entry) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { void this.flush(entry); }, Math.max(0, entry.due - Date.now()));
  }
  private finish(entry: Entry, refresh = true) {
    clearTimeout(entry.timer); this.entries.delete(entry.menuId); this.emit();
    if (refresh && !this.entries.size) {
      const generation = this.generation;
      this.refresh = setTimeout(() => {
        if (generation === this.generation && !this.entries.size) {
          void this.client.invalidateQueries({ queryKey: apiKeys.favorites() });
        }
      }, FAVORITE_DEBOUNCE_MS);
    }
  }
  private async flush(entry: Entry) {
    const generation = this.generation;
    if (!this.live(entry, generation) || entry.inFlight) return;
    if (entry.desired === entry.confirmed) { this.finish(entry, false); return; }
    const target = entry.desired;
    entry.inFlight = true;
    try {
      if (entry.confirmed && !entry.favorite) {
        const favorites = await this.client.ensureQueryData({ queryKey: apiKeys.favorites(), queryFn: () => this.api().getFavorites() });
        if (!this.live(entry, generation)) return;
        entry.favorite = favorites.find((item) => item.menu_id === entry.menuId);
        entry.confirmed = !!entry.favorite;
      }
      await this.client.cancelQueries({ queryKey: apiKeys.favorites() });
      if (!this.live(entry, generation)) return;
      // Clicks during a lookup/cancellation may supersede the original target.
      if (entry.desired !== target) return;
      if (target) {
        const result = await this.api().addFavorite(entry.menuId);
        if (!this.live(entry, generation)) return;
        entry.favorite = { ...this.record(entry), id: result.id };
      } else if (entry.favorite) {
        await this.api().removeFavorite(entry.favorite.id);
        if (!this.live(entry, generation)) return;
      }
      entry.confirmed = target;
      this.client.setQueryData<ApiFavorite[]>(apiKeys.favorites(), (previous = []) => {
        const others = previous.filter((item) => item.menu_id !== entry.menuId);
        return target ? [...others, this.record(entry)] : others;
      });
    } catch {
      if (!this.live(entry, generation)) return;
      if (entry.desired === target) {
        this.error = "저장 상태를 변경하지 못했습니다. 다시 시도해주세요.";
        this.errorTimer = setTimeout(() => { this.error = null; this.emit(); }, 4000);
        this.finish(entry); return;
      }
    } finally {
      if (this.live(entry, generation)) {
        entry.inFlight = false;
        if (entry.desired === entry.confirmed) this.finish(entry);
        else this.schedule(entry);
      }
    }
  }
}

const controllers = new WeakMap<QueryClient, FavoriteSync>();
export function favoriteSync(client: QueryClient, api: () => FavoriteApi) {
  let controller = controllers.get(client);
  if (!controller) { controller = new FavoriteSync(client, api); controllers.set(client, controller); }
  return controller;
}
