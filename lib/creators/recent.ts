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
  Channel feeds are cached for a few minutes and durations for good (a video's
  length never changes), so moving around the page does not re-fetch everything.
*/
const FEED_TTL = 5 * 60_000;
const g = globalThis as typeof globalThis & {
  __feeds?: Map<string, { at: number; videos: Promise<FeedVideo[]> }>;
  __durations?: Map<string, number | undefined>;
};
const feeds = (g.__feeds ??= new Map());
const durations = (g.__durations ??= new Map());

function feedOf(channelId: string): Promise<FeedVideo[]> {
  const hit = feeds.get(channelId);
  if (hit && Date.now() - hit.at < FEED_TTL) return hit.videos;
  const videos = listChannelVideos(channelId);
  feeds.set(channelId, { at: Date.now(), videos });
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
export async function recentVideos(creators: Creator[]): Promise<Recent> {
  const reach: FeedReach[] = [];
  const perCreator = await Promise.all(
    creators.map(async (c) => {
      try {
        const videos = await feedOf(c.channelId);
        reach.push({ channelId: c.channelId, full: videos.length >= FEED_CAP, oldest: videos.at(-1)?.publishedAt });
        return videos.filter((v) => withinDays(v.publishedAt, MAX_DAYS)).map((video) => ({ c, video }));
      } catch (err) {
        console.log(`[creators] ${c.name} feed failed: ${(err as Error).message}`);
        return [];
      }
    }),
  );
  const recent = perCreator.flat().sort((a, b) => b.video.publishedAt.localeCompare(a.video.publishedAt));
  const found: (number | undefined)[] = [];
  for (let n = 0; n < recent.length; n += 10) {
    found.push(...(await Promise.all(recent.slice(n, n + 10).map((r) => durationOf(r.video.videoId)))));
  }
  const cards = recent.map(({ c, video }, n) => ({
    channelId: c.channelId,
    publishedAt: video.publishedAt,
    card: toCard(videoItem({ ...video, duration: found[n] }, video.publishedAt), undefined, false),
  }));
  return { cards, reach };
}
