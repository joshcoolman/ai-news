import { mutate, read } from "./store.js";
import { cachedVideo } from "./creators/recent.js";
import { favoriteCopy } from "./feed/rules.js";
import { videoItem, videoItemId } from "./refresh/save.js";
import { thumbnailUrl } from "./youtube.js";

/*
  What the player window asks the server: the video it is playing as the app
  knows it, and favoriting that video.
*/

/**
 * @param {Data} d
 * @param {string} id
 */
function storedVideo(d, id) {
  const found = d.items.find((i) => i.id === id && !i.hiddenBy) ?? d.favorites.find((f) => f.item.id === id)?.item;
  return found?.kind === "video" ? found : undefined;
}

/**
 * The video as the player sees it: from the feed, Favorites, or today's
 * creator lists (Creators-page videos are not stored). `title` covers a video
 * found nowhere.
 * @param {string} videoId
 * @returns {Promise<PlayerVideo>}
 */
export async function playerVideo(videoId, title = "") {
  const d = await read();
  const id = videoItemId(videoId);
  const stored = storedVideo(d, id);
  const cached = stored ? undefined : await cachedVideo(videoId);
  const channel = stored?.channel ?? cached?.video.channel;
  const creator = cached
    ? d.creators.find((c) => c.channelId === cached.channelId)
    : d.creators.find((c) => c.name.toLowerCase() === channel?.toLowerCase());
  const item = d.items.find((i) => i.id === id && !i.hiddenBy);
  return {
    id,
    videoId,
    title: stored?.title ?? cached?.video.title ?? title,
    link: `https://www.youtube.com/watch?v=${videoId}`,
    thumbUrl: thumbnailUrl(videoId),
    channel,
    creator: creator && { name: creator.name, avatarUrl: creator.avatarUrl },
    inFeed: !!item,
    removed: !!item?.removedAt,
    favorited: d.favorites.some((f) => f.item.id === id),
    onFavorite: d.settings.onFavorite,
  };
}

/**
 * Favorite a video from the player: a copy of its feed card, or, for a Creators-page video, the video itself. Idempotent.
 * @param {string} videoId
 */
export async function favoriteVideo(videoId) {
  const id = videoItemId(videoId);
  const cached = await cachedVideo(videoId);
  return mutate((d) => {
    if (d.favorites.some((f) => f.item.id === id)) return true;
    const item = d.items.find((i) => i.id === id) ?? (cached && videoItem(cached.video, new Date().toISOString()));
    if (!item) return false;
    d.favorites.push({ item: favoriteCopy(item), favoritedAt: new Date().toISOString() });
    return true;
  });
}
