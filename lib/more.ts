import { mutate, read } from "./store";
import type { VideoItem } from "./store/types";
import { pickRelevant, writeQuery } from "./agent/small";
import { search } from "./youtube";
import { fillDurations, videoItem } from "./refresh";

export type MoreResult = { added: number; message?: string };

const PAGE = 12;

/**
 * "More like this" for one card: write a query (once per card), search further
 * down than last time, skip videos already in the feed, keep up to 4 relevant
 * ones, and store them after the card. Not filtered by the avoid list.
 */
export async function moreLikeThis(itemId: string): Promise<MoreResult> {
  const { items } = await read();
  const card = items.find((i) => i.id === itemId);
  if (!card) throw new NotFoundError();

  const forQuery = {
    label: card.kind === "story" ? card.label : card.moreLabel ?? "",
    title: card.title,
    source: card.kind === "story" ? card.link : `YouTube, ${card.channel}`,
  };

  let query = card.moreQuery;
  let label = card.kind === "story" ? card.label : card.moreLabel;
  if (!query) {
    const written = await writeQuery(forQuery);
    query = written.query;
    label ??= written.label;
  }

  const skip = card.moreSeen ?? 0;
  const results = await search(query, { skip, count: PAGE });
  const inFeed = new Set(items.filter((i): i is VideoItem => i.kind === "video").map((i) => i.videoId));
  const fresh = results.filter((r) => !inFeed.has(r.videoId));
  const picks = fresh.length ? await pickRelevant({ ...forQuery, label: label ?? "" }, fresh) : [];

  const base = Date.now();
  const added = await mutate((d) => {
    const target = d.items.find((i) => i.id === itemId);
    if (!target) return [];
    target.moreQuery = query;
    target.moreSeen = skip + results.length;
    if (target.kind === "video" && label) target.moreLabel = label;
    const have = new Set(d.items.map((i) => i.id));
    const out: VideoItem[] = [];
    picks.forEach((p, n) => {
      const item = { ...videoItem(fresh[p], new Date(base + n).toISOString()), after: itemId };
      if (have.has(item.id)) return;
      have.add(item.id);
      d.items.push(item);
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
