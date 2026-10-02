import "server-only";
import type { Card } from "../feed/cards";
import { toCard } from "../feed/cards";
import { withinDays } from "../feed/rules";
import { videoItem } from "../refresh/save";
import type { Creator } from "../store/types";
import { listChannelVideos, videoDuration, type FeedVideo } from "../sources/youtube";
import { FEED_CAP, MAX_DAYS } from "./window";

export type RecentCard = { channelId: string; publishedAt: string; card: Card };

/** Per channel: whether its feed came back full, and the oldest video it showed. Tells the page when a count may be cut off. */
export type FeedReach = { channelId: string; full: boolean; oldest?: string };

export type Recent = { cards: RecentCard[]; reach: FeedReach[] };

/*
  Channel feeds are cached for the day and durations for good (a video's length
  never changes), so coming back to the page does not re-fetch everything. A
  reload of the Creators page asks for fresh feeds.
*/
const g = globalThis as typeof globalThis & {
  __feeds?: Map<string, { day: string; videos: Promise<FeedVideo[]> }>;
  __durations?: Map<string, number | undefined>;
};
const feeds = (g.__feeds ??= new Map());
const durations = (g.__durations ??= new Map());

const today = () => new Date().toDateString();

function feedOf(channelId: string, fresh: boolean): Promise<FeedVideo[]> {
  const hit = feeds.get(channelId);
  if (hit && !fresh && hit.day === today()) return hit.videos;
  const videos = listChannelVideos(channelId);
  feeds.set(channelId, { day: today(), videos });
  videos.catch(() => feeds.delete(channelId));
  return videos;
}

async function durationOf(videoId: string): Promise<number | undefined> {
  if (durations.has(videoId)) return durations.get(videoId);
  const d = await videoDuration(videoId);
  if (d !== undefined) durations.set(videoId, d);
  return d;
}

/**
 * Every video each creator published in the last MAX_DAYS, newest first, read
 * live from the channel feeds. The page narrows it to the chosen window. Not
 * stored: nothing here is managed. A channel whose feed fails is skipped.
 */
export async function recentVideos(creators: Creator[], fresh = false): Promise<Recent> {
  const { entries, reach } = await recentEntries(creators, fresh);
  const found: (number | undefined)[] = [];
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

/** A video from today's cached channel feeds (the Creators page's videos are not stored), with its channel. */
export async function cachedVideo(videoId: string): Promise<{ channelId: string; video: FeedVideo } | undefined> {
  for (const [channelId, hit] of feeds) {
    const video = (await hit.videos.catch(() => [])).find((v: FeedVideo) => v.videoId === videoId);
    if (video) return { channelId, video };
  }
}

/** The raw videos behind the page, newest first, and how far each channel feed reached. */
export async function recentEntries(creators: Creator[], fresh = false) {
  const reach: FeedReach[] = [];
  const perCreator = await Promise.all(
    creators.map(async (c) => {
      try {
        const videos = await feedOf(c.channelId, fresh);
        reach.push({ channelId: c.channelId, full: videos.length >= FEED_CAP, oldest: videos.at(-1)?.publishedAt });
        return videos.filter((v) => withinDays(v.publishedAt, MAX_DAYS)).map((video) => ({ c, video }));
      } catch (err) {
        console.log(`[creators] ${c.name} feed failed: ${(err as Error).message}`);
        return [];
      }
    }),
  );
  const entries = perCreator.flat().sort((x, y) => y.video.publishedAt.localeCompare(x.video.publishedAt));
  return { entries, reach };
}
