import { toCard } from "../feed/cards.js";
import { playable, withinDays } from "../feed/rules.js";
import { read } from "../store.js";
import { videoItem } from "../refresh/save.js";
import { listChannelVideos, videoDuration } from "../youtube.js";
import { FEED_CAP, MAX_DAYS } from "./window.js";

/*
  Channel lists are cached for the day and durations for good (a video's length
  never changes), so coming back to the page does not re-fetch everything. A
  reload of the Creators page asks for fresh lists.
*/
/** @type {Map<string, { day: string, videos: Promise<FeedVideo[]> }>} */
const feeds = new Map();
/** @type {Map<string, number>} */
const durations = new Map();

const today = () => new Date().toDateString();

/**
 * @param {string} channelId
 * @param {boolean} fresh
 */
function feedOf(channelId, fresh) {
  const hit = feeds.get(channelId);
  if (hit && !fresh && hit.day === today()) return hit.videos;
  const videos = listChannelVideos(channelId);
  feeds.set(channelId, { day: today(), videos });
  videos.catch(() => feeds.delete(channelId));
  return videos;
}

/** @param {string} videoId */
async function durationOf(videoId) {
  if (durations.has(videoId)) return durations.get(videoId);
  const d = await videoDuration(videoId);
  if (d !== undefined) durations.set(videoId, d);
  return d;
}

/**
 * Every video each creator published in the last MAX_DAYS, newest first, read
 * live from the channel lists. The page narrows it to the chosen window. Not
 * stored: nothing here is managed. A channel whose list fails is skipped.
 * @param {Creator[]} creators
 * @returns {Promise<Recent>}
 */
export async function recentVideos(creators, fresh = false) {
  const { entries, reach } = await recentEntries(creators, fresh);
  /** @type {(number | undefined)[]} */
  const found = [];
  for (let n = 0; n < entries.length; n += 10) {
    found.push(...(await Promise.all(entries.slice(n, n + 10).map((r) => durationOf(r.video.videoId)))));
  }
  const cards = entries.map(({ c, video }, n) => ({
    channelId: c.channelId,
    publishedAt: video.publishedAt,
    card: toCard(videoItem({ ...video, duration: found[n] }, video.publishedAt), undefined, false),
  }));
  return { cards, reach };
}

/**
 * A video from today's cached channel lists (the Creators page's videos are not stored), with its channel.
 * @param {string} videoId
 */
export async function cachedVideo(videoId) {
  for (const [channelId, hit] of feeds) {
    const video = (await hit.videos.catch(() => /** @type {FeedVideo[]} */ ([]))).find((v) => v.videoId === videoId);
    if (video) return { channelId, video };
  }
}

/**
 * The raw videos behind the page, newest first, and how far each channel list reached.
 * @param {Creator[]} creators
 */
export async function recentEntries(creators, fresh = false) {
  /** @type {FeedReach[]} */
  const reach = [];
  const { settings } = await read();
  const perCreator = await Promise.all(
    creators.map(async (c) => {
      try {
        // The cache holds every video, so changing the setting shows at once.
        const videos = playable(await feedOf(c.channelId, fresh), settings);
        reach.push({ channelId: c.channelId, full: videos.length >= FEED_CAP, oldest: videos.at(-1)?.publishedAt });
        return videos.filter((v) => withinDays(v.publishedAt, MAX_DAYS)).map((video) => ({ c, video }));
      } catch (err) {
        console.log(`[creators] ${c.name} list failed: ${/** @type {Error} */ (err).message}`);
        return [];
      }
    }),
  );
  const entries = perCreator.flat().sort((x, y) => y.video.publishedAt.localeCompare(x.video.publishedAt));
  return { entries, reach };
}
