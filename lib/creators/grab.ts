import "server-only";
import { read } from "../store";
import type { Creator } from "../store/types";
import { filterVideos } from "../ai/filter";
import { maxBatch, playable, withinDays } from "../feed/rules";
import { listChannelVideos } from "../sources/youtube";
import { saveVideos, videoItemId } from "../refresh/save";
import { clampDays, DEFAULT_DAYS } from "./window";

/**
 * The quick grab after adding a creator: their videos from the Creators page's
 * window, not already stored, run through the creator's guidance (when it has
 * any), added to the feed as one new batch. Returns how many cards appeared.
 */
export async function grabRecent(creator: Creator): Promise<number> {
  const data = await read();
  const days = clampDays(data.settings.creatorsWindowDays ?? DEFAULT_DAYS);
  const stored = new Set(data.items.map((i) => i.id));
  const videos = playable(await listChannelVideos(creator.channelId), data.settings);
  const fresh = videos.filter((v) => withinDays(v.publishedAt, days) && !stored.has(videoItemId(v.videoId)));
  const guidance = creator.guidance.trim();

  let held = new Map<number, { kind: "guidance"; text: string }>();
  if (fresh.length && guidance) {
    try {
      held = await filterVideos(fresh.map((v) => ({ ...v, guidance })));
    } catch (err) {
      console.log(`[creators] filter failed, letting every video through: ${(err as Error).message}`);
    }
  }
  const added = await saveVideos(
    maxBatch(data.items) + 1,
    creator.channelId,
    videos[0]?.publishedAt,
    fresh.map((video, n) => ({ video, hiddenBy: held.get(n) })),
  );
  return added.filter((i) => !i.hiddenBy).length;
}
