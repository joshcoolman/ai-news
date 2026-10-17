import { toCard, videoItem } from "../cards.js";
import { listFresh, playable } from "../rules.js";
import { mutate, read } from "../store.js";
import { listChannelVideos, videoDurations } from "../youtube.js";
import { FEED_CAP } from "./window.js";

/*
  Channel lists are read at most twice a day and lengths once ever (a video's
  length never changes). Both live in the store's cache file, so a server
  restart costs nothing (#67). A list older than LIST_TTL_HOURS is read again
  on the next request, a creator added since is read at once, and one request
  writes the cache once however many lists it read.
*/

export const LIST_TTL_HOURS = 12;

/**
 * Each creator's cached list in full (their newest FEED_CAP videos), newest
 * first. The page narrows it to the chosen window, or shows all of one
 * creator's when picked (#54). A channel whose list fails is skipped.
 * @param {Creator[]} creators
 * @returns {Promise<Recent>}
 */
export async function recentVideos(creators) {
  const { entries, reach, failed, readAt } = await recentEntries(creators);
  const durations = await durationsOf(entries.map((r) => r.video.videoId));
  const cards = entries.map(({ c, video }) => ({
    channelId: c.channelId,
    publishedAt: video.publishedAt,
    card: toCard(videoItem({ ...video, duration: durations[video.videoId] }, video.publishedAt)),
  }));
  return { cards, reach, readAt, ...(failed && { failed }) };
}

/**
 * The raw videos behind the page, newest first, how far each channel list
 * reached, and when the oldest list in use was read.
 * @param {Creator[]} creators
 */
export async function recentEntries(creators) {
  const lists = await listsOf(creators);
  const { settings } = await read();
  /** @type {FeedReach[]} */
  const reach = [];
  /** @type {string[]} */
  const errors = [];
  const entries = creators
    .flatMap((c) => {
      const hit = lists[c.channelId];
      if (!hit) return [];
      if ("error" in hit) {
        errors.push(hit.error);
        return [];
      }
      // The cache holds every video, so changing the setting shows at once.
      const videos = playable(hit.videos, settings);
      reach.push({ channelId: c.channelId, full: videos.length >= FEED_CAP, oldest: videos.at(-1)?.publishedAt });
      return videos.map((video) => ({ c, video }));
    })
    .sort((x, y) => y.video.publishedAt.localeCompare(x.video.publishedAt));
  // One list failing is that creator's problem; all of them failing is the page's, and it must say why rather than show an empty grid.
  const failed = creators.length && errors.length === creators.length ? errors[0] : undefined;
  const readAt = Object.values(lists)
    .flatMap((hit) => ("readAt" in hit ? [hit.readAt] : []))
    .sort()[0];
  return { entries, reach, failed, readAt };
}

/**
 * Every creator's list: from the cache while fresh, the stale ones read from
 * YouTube at once and written back together. A failed read keeps its error.
 * @param {Creator[]} creators
 * @returns {Promise<Record<string, YouTubeCache["lists"][string] | { error: string }>>}
 */
async function listsOf(creators) {
  const { cache } = await read();
  /** @type {Record<string, YouTubeCache["lists"][string] | { error: string }>} */
  const out = {};
  /** @type {Record<string, YouTubeCache["lists"][string]>} */
  const fresh = {};
  await Promise.all(
    creators.map(async (c) => {
      const hit = cache.lists[c.channelId];
      if (hit && listFresh(hit.readAt, LIST_TTL_HOURS)) return void (out[c.channelId] = hit);
      try {
        fresh[c.channelId] = out[c.channelId] = { readAt: new Date().toISOString(), videos: await listChannelVideos(c.channelId) };
      } catch (err) {
        const error = /** @type {Error} */ (err).message;
        console.log(`[creators] ${c.name} list failed: ${error}`);
        // A stale list beats none while YouTube is not answering.
        out[c.channelId] = hit ?? { error };
      }
    }),
  );
  if (Object.keys(fresh).length) await mutate((d) => void Object.assign(d.cache.lists, fresh));
  return out;
}

/**
 * Lengths for these videos: the cached ones, and one batched request for the rest, written back.
 * @param {string[]} ids
 */
async function durationsOf(ids) {
  const { cache } = await read();
  const missing = ids.filter((id) => cache.durations[id] === undefined);
  if (!missing.length) return cache.durations;
  const found = await videoDurations(missing);
  if (!found.size) return cache.durations;
  return mutate((d) => {
    for (const [id, s] of found) d.cache.durations[id] = s;
    return d.cache.durations;
  });
}

/**
 * A video from the cached channel lists (the Creators page's videos are not stored), with its channel.
 * @param {string} videoId
 */
export async function cachedVideo(videoId) {
  const { cache } = await read();
  for (const [channelId, hit] of Object.entries(cache.lists)) {
    const video = hit.videos.find((v) => v.videoId === videoId);
    if (video) return { channelId, video };
  }
}
