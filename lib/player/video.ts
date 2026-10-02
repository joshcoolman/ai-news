import "server-only";
import { mutate, read } from "../store";
import type { Data, Settings, VideoItem } from "../store/types";
import { cachedVideo } from "../creators/recent";
import { favoriteCopy } from "../feed/rules";
import { videoItem, videoItemId } from "../refresh/save";
import { thumbnailUrl } from "../sources/youtube";

/** What the player window's bar needs about the video it is playing. */
export type PlayerVideo = {
  id: string;
  videoId: string;
  title: string;
  link: string;
  thumbUrl: string;
  /** Unknown only for a video found nowhere in the app. */
  channel?: string;
  /** The saved creator behind this video, when there is one. */
  creator?: { name: string; avatarUrl: string };
  /** A card on home (not held back), so favoriting can remove it there and unfavoriting restore it. */
  inFeed: boolean;
  removed: boolean;
  favorited: boolean;
  onFavorite: Settings["onFavorite"];
};

function storedVideo(d: Data, id: string): VideoItem | undefined {
  const found = d.items.find((i) => i.id === id && !i.hiddenBy) ?? d.favorites.find((f) => f.item.id === id)?.item;
  return found?.kind === "video" ? found : undefined;
}

/**
 * The video as the player sees it: from the feed, Favorites, or today's
 * creator feeds (Creators-page videos are not stored). `title` covers a video
 * found nowhere.
 */
export async function playerVideo(videoId: string, title = ""): Promise<PlayerVideo> {
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

/** Favorite a video from the player: a copy of its feed card, or, for a Creators-page video, the video itself. Idempotent. */
export async function favoriteVideo(videoId: string): Promise<boolean> {
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
