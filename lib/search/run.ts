import "server-only";
import { mutate, read } from "../store";
import { firstUnstored, maxBatch, mergeBatch } from "../feed/rules";
import { writeQuery } from "../ai/more-like-this";
import { search } from "../sources/youtube";
import { fillDurations, videoItem } from "../refresh/save";

export type SearchResult = { added: number; message?: string };

const KEEP = 8;
const FETCH = 40;

/**
 * Start a search from a video that is not in the feed (a Creators-page card):
 * the model names the topic, then it runs as a normal home search.
 */
export async function searchFromVideo(video: { title: string; channel: string }): Promise<SearchResult & { query: string }> {
  const { query } = await writeQuery({ label: "", title: video.title, source: `YouTube, ${video.channel}` });
  return { query, ...(await searchHome(query)) };
}

/**
 * Home-page search: the query exactly as typed, YouTube's past-month filter,
 * the first 8 results not already stored, added as a new batch at the top.
 */
export async function searchHome(query: string): Promise<SearchResult> {
  const results = await search(query, { count: FETCH, pastMonth: true });
  const now = new Date().toISOString();
  const added = await mutate((d) => {
    const fresh = firstUnstored(d.items, results, KEEP);
    const incoming = fresh.map((r) => ({ ...videoItem(r, now), searchQuery: query }));
    return mergeBatch(d.items, incoming, maxBatch(d.items) + 1);
  });
  void fillDurations(added);
  return added.length ? { added: added.length } : { added: 0, message: `Nothing new in the last month for ${query}` };
}
