import { mutate, read } from "./store.js";
import { firstUnstored, maxBatch, mergeBatch, playable } from "./feed/rules.js";
import { writeQuery } from "./ai/more-like-this.js";
import { search } from "./youtube.js";
import { fillDurations, videoItem } from "./refresh/save.js";

const KEEP = 8;
const FETCH = 40;

/**
 * Start a search from a video that is not in the feed (a Creators-page card):
 * the model names the topic, then it runs as a normal home search.
 * @param {{ title: string, channel: string }} video
 */
export async function searchFromVideo(video) {
  const { query } = await writeQuery({ label: "", title: video.title, source: `YouTube, ${video.channel}` });
  return { query, ...(await searchHome(query)) };
}

/**
 * Home-page search: the query exactly as typed, the last 30 days, the first 8
 * results not already stored, added as a new batch at the top.
 * @param {string} query
 * @returns {Promise<{ added: number, message?: string }>}
 */
export async function searchHome(query) {
  const results = playable(await search(query, { count: FETCH, pastMonth: true }), (await read()).settings);
  const now = new Date().toISOString();
  const added = await mutate((d) => {
    const fresh = firstUnstored(d.items, results, KEEP);
    const incoming = fresh.map((r) => ({ ...videoItem(r, now), searchQuery: query }));
    return mergeBatch(d.items, incoming, maxBatch(d.items) + 1);
  });
  void fillDurations(added);
  return added.length ? { added: added.length } : { added: 0, message: `Nothing new in the last month for ${query}` };
}
