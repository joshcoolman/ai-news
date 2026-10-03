import "server-only";
import type { Data, Item } from "../store/types";
import { displayOrder, latestBatch, treeOrder } from "./rules";
import { thumbnailUrl } from "../sources/youtube";

/** What the browser needs to draw one card. */
export type Card = {
  id: string;
  kind: "video" | "story";
  title: string;
  link: string;
  /** Video cards: plays in the app's player window. */
  videoId?: string;
  /** Video cards: the real thumbnail. Story cards: a label drawn on a colour block. */
  thumbUrl?: string;
  label?: string;
  meta: string;
  duration?: string;
  isNew: boolean;
  /** A copy is in Favorites. */
  favorited?: boolean;
};

export type FeedView = { cards: Card[] };

export function buildFeed(data: Data): FeedView {
  const latest = latestBatch(data.items);
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const favorited = new Set(data.favorites.map((f) => f.item.id));
  const cards = displayOrder(data.items).map((item) => ({
    ...toCard(item, item.after ? byId.get(item.after) : undefined, item.batch !== undefined && item.batch === latest),
    favorited: favorited.has(item.id),
  }));

  return { cards };
}

/** Favorites, newest first, each followed by its "more like this" results. */
export function favoriteCards(data: Data): Card[] {
  const items = data.favorites.map((f) => f.item);
  const at = new Map(data.favorites.map((f) => [f.item.id, f.favoritedAt]));
  const byId = new Map(items.map((i) => [i.id, i]));
  return treeOrder(items, (a, b) => at.get(b.id)!.localeCompare(at.get(a.id)!)).map((item) =>
    toCard(item, item.after ? byId.get(item.after) : undefined, false),
  );
}

/** One card as the browser draws it. */
export function toCard(item: Item, parent: Item | undefined, isNew: boolean): Card {
  const prefix = parent ? `More like ${nameOf(parent)} · ` : item.searchQuery ? `Search: ${item.searchQuery} · ` : "";
  const base = { id: item.id, kind: item.kind, title: item.title, link: item.link, isNew };
  if (item.kind === "video") {
    return {
      ...base,
      videoId: item.videoId,
      thumbUrl: thumbnailUrl(item.videoId),
      meta: `${prefix}${item.channel} · ${shortDate(item.publishedAt)}`,
      duration: item.duration ? formatDuration(item.duration) : undefined,
    };
  }
  return { ...base, label: item.label, meta: `${prefix}${item.topic} · ${item.sourceDomain}` };
}

function nameOf(item: Item): string {
  if (item.kind === "story") return item.label;
  return item.moreLabel ?? item.title;
}

/** How long ago a recent video would still say "N days ago" rather than its date. */
const AGO_DAYS = 28;

/** When a video came out: "5 hours ago" or "3 days ago" while it is recent, the date after that. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  const hours = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (hours >= 0 && hours < 24) return hours < 1 ? "just now" : `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days >= 1 && days <= AGO_DAYS) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

function formatDuration(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
