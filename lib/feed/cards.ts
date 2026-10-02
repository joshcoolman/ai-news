import "server-only";
import type { Data, Item } from "../store/types";
import { displayOrder, latestBatch, maxBatch } from "./rules";
import { thumbnailUrl } from "../sources/youtube";

/** What the browser needs to draw one card. */
export type Card = {
  id: string;
  kind: "video" | "story";
  title: string;
  link: string;
  /** Video cards: the real thumbnail. Story cards: a label drawn on a colour block. */
  thumbUrl?: string;
  label?: string;
  meta: string;
  duration?: string;
  isNew: boolean;
};

export type HiddenCard = { id: string; title: string; channel: string; why: string };

export type FeedView = { cards: Card[]; hidden: HiddenCard[] };

export function buildFeed(data: Data): FeedView {
  const latest = latestBatch(data.items);
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const cards = displayOrder(data.items).map((item) =>
    toCard(item, item.after ? byId.get(item.after) : undefined, item.batch !== undefined && item.batch === latest),
  );

  // Hidden items from the most recent refresh that produced anything.
  const last = maxBatch(data.items);
  const hidden = data.items
    .filter((i) => i.hiddenBy && i.batch === last && !i.removedAt)
    .map((i) => ({
      id: i.id,
      title: i.title,
      channel: i.kind === "video" ? i.channel : i.sourceDomain,
      why: i.hiddenBy!.kind === "guidance" ? `Guidance: ${i.hiddenBy!.text}` : `Avoid: ${i.hiddenBy!.text}`,
    }));

  return { cards, hidden };
}

/** One card as the browser draws it. */
export function toCard(item: Item, parent: Item | undefined, isNew: boolean): Card {
  const prefix = parent ? `More like ${nameOf(parent)} · ` : "";
  const base = { id: item.id, kind: item.kind, title: item.title, link: item.link, isNew };
  if (item.kind === "video") {
    return {
      ...base,
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

function shortDate(iso: string): string {
  const d = new Date(iso);
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
