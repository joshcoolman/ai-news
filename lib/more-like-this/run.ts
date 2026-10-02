import "server-only";
import { mutate, read } from "../store";
import type { Data, Item, VideoItem } from "../store/types";
import { pickRelevant, writeQuery } from "../ai/more-like-this";
import { search } from "../sources/youtube";
import { fillDurations, videoItem } from "../refresh/save";

export type MoreResult = { added: number; message?: string };

/** Which list a search runs in. Results land only in that list, after the card. */
export type Bucket = "feed" | "favorites";

const PAGE = 12;

/** The items of one bucket, and how to add a result to it. */
const BUCKETS: Record<Bucket, { items: (d: Data) => Item[]; add: (d: Data, item: VideoItem) => void }> = {
  feed: { items: (d) => d.items, add: (d, item) => d.items.push(item) },
  favorites: {
    items: (d) => d.favorites.map((f) => f.item),
    add: (d, item) => d.favorites.push({ item, favoritedAt: item.createdAt }),
  },
};

/**
 * "More like this" for one card: write a query (once per card), search further
 * down than last time, skip videos already in the same bucket, keep up to 4
 * relevant ones, and store them after the card. Not filtered by the avoid list.
 */
export async function moreLikeThis(itemId: string, bucket: Bucket = "feed"): Promise<MoreResult> {
  const { items: itemsOf, add } = BUCKETS[bucket];
  const items = itemsOf(await read());
  const card = items.find((i) => i.id === itemId);
  if (!card) throw new NotFoundError();

  const forQuery = {
    label: card.kind === "story" ? card.label : card.moreLabel ?? "",
    title: card.title,
    source: card.kind === "story" ? card.link : `YouTube, ${card.channel}`,
  };

  let label = card.kind === "story" ? card.label : card.moreLabel;
  const inBucket = new Set(items.filter((i): i is VideoItem => i.kind === "video").map((i) => i.videoId));
  const attempt = async (q: string, skip: number) => {
    const results = await search(q, { skip, count: PAGE });
    const fresh = results.filter((r) => !inBucket.has(r.videoId));
    const picks = fresh.length ? await pickRelevant({ ...forQuery, label: label ?? "" }, fresh) : [];
    return { query: q, skip, results, fresh, picks };
  };

  let query = card.moreQuery;
  if (!query) {
    const written = await writeQuery(forQuery);
    query = written.query;
    label ??= written.label;
  }

  let found = await attempt(query, card.moreSeen ?? 0);
  // A written query can drift off the thing (one added "GPT-6" and found only GPT-6 videos).
  // On a first search that picks nothing, retry with the card's own label.
  if (!found.picks.length && !found.skip && label && label.toLowerCase() !== query.toLowerCase()) {
    console.log(`[more] "${query}" found nothing relevant; retrying with "${label}"`);
    found = await attempt(label, 0);
  }
  const { results, fresh, picks, skip } = found;
  // Only remember a query that worked, or one already being paged through; a dud is rewritten next time.
  const keep = picks.length > 0 || skip > 0;

  const base = Date.now();
  const added = await mutate((d) => {
    const list = itemsOf(d);
    const target = list.find((i) => i.id === itemId);
    if (!target) return [];
    if (keep) {
      target.moreQuery = found.query;
      target.moreSeen = skip + results.length;
    }
    if (target.kind === "video" && label) target.moreLabel = label;
    const have = new Set(list.map((i) => i.id));
    const out: VideoItem[] = [];
    picks.forEach((p, n) => {
      const item = { ...videoItem(fresh[p], new Date(base + n).toISOString()), after: itemId };
      if (have.has(item.id)) return;
      have.add(item.id);
      add(d, item);
      out.push(item);
    });
    return out;
  });

  void fillDurations(added);

  if (added.length) return { added: added.length };
  if (!results.length) return { added: 0, message: "Nothing further" };
  return { added: 0, message: skip > 0 ? "Nothing further" : "Nothing found" };
}

export class NotFoundError extends Error {}
