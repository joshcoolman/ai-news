import { mutate, read } from "./store.js";
import { cachedVideo } from "./creators/recent.js";
import { videoItem, videoItemId } from "./cards.js";
import { thumbnailUrl } from "./youtube.js";

/*
  What the player window asks the server: the video it is playing as the app
  knows it, and favoriting that video.
*/

/**
 * The video as the player sees it: from Favorites or the cached creator
 * lists (Creators-page videos are not stored). `title` covers a video found nowhere.
 * @param {string} videoId
 * @returns {Promise<PlayerVideo>}
 */
export async function playerVideo(videoId, title = "") {
  const d = await read();
  const id = videoItemId(videoId);
  const stored = d.favorites.find((f) => f.item.id === id)?.item;
  const cached = stored ? undefined : await cachedVideo(videoId);
  const channel = stored?.channel ?? cached?.video.channel;
  const creator = cached
    ? d.creators.find((c) => c.channelId === cached.channelId)
    : d.creators.find((c) => c.name.toLowerCase() === channel?.toLowerCase());
  return {
    id,
    videoId,
    title: stored?.title ?? cached?.video.title ?? title,
    link: `https://www.youtube.com/watch?v=${videoId}`,
    thumbUrl: thumbnailUrl(videoId),
    channel,
    creator: creator && { name: creator.name, avatarUrl: creator.avatarUrl },
    favorited: !!stored,
  };
}

/**
 * Favorite the video playing in the player, by video id: the video itself from the cached creator lists. Idempotent.
 * @param {string} videoId
 */
export async function favoriteVideo(videoId) {
  const id = videoItemId(videoId);
  const cached = await cachedVideo(videoId);
  return mutate((d) => {
    if (d.favorites.some((f) => f.item.id === id)) return true;
    if (!cached) return false;
    d.favorites.push({ item: videoItem(cached.video, new Date().toISOString()), favoritedAt: new Date().toISOString() });
    return true;
  });
}
