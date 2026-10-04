import { read } from "../store.js";
import { filterVideos } from "../ai/filter.js";
import { maxBatch, playable, withinDays } from "../feed/rules.js";
import { listChannelVideos } from "../youtube.js";
import { saveVideos, videoItemId } from "../refresh/save.js";
import { clampDays, DEFAULT_DAYS } from "./window.js";

/**
 * The quick grab after adding a creator: their videos from the Creators page's
 * window, not already stored, run through the creator's guidance (when it has
 * any), added to the feed as one new batch. Returns how many cards appeared.
 * @param {Creator} creator
 */
export async function grabRecent(creator) {
  const data = await read();
  const days = clampDays(data.settings.creatorsWindowDays ?? DEFAULT_DAYS);
  const stored = new Set(data.items.map((i) => i.id));
  const videos = playable(await listChannelVideos(creator.channelId), data.settings);
  const fresh = videos.filter((v) => withinDays(v.publishedAt, days) && !stored.has(videoItemId(v.videoId)));
  const guidance = creator.guidance.trim();

  /** @type {Map<number, HiddenBy>} */
  let held = new Map();
  if (fresh.length && guidance) {
    try {
      held = await filterVideos(fresh.map((v) => ({ ...v, guidance })));
    } catch (err) {
      console.log(`[creators] filter failed, letting every video through: ${/** @type {Error} */ (err).message}`);
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
