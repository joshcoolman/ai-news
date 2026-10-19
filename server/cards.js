import { parseChapters } from "./youtube-parse.js";
import { thumbnailUrl } from "./youtube.js";

/*
  Stored videos turned into the cards the browser draws.
*/

/** @param {string} videoId */
export function videoItemId(videoId) {
  return `v-${videoId}`;
}

/**
 * @param {{ videoId: string, title: string, channel: string, publishedAt?: string, duration?: number, description?: string }} v
 * @param {string} createdAt
 * @returns {VideoItem}
 */
export function videoItem(v, createdAt) {
  return {
    id: videoItemId(v.videoId),
    kind: "video",
    createdAt,
    title: v.title,
    link: `https://www.youtube.com/watch?v=${v.videoId}`,
    videoId: v.videoId,
    channel: v.channel,
    publishedAt: v.publishedAt ?? createdAt,
    ...(v.duration ? { duration: v.duration } : {}),
    // Whether the description lists chapters is all the Player's History row needs; the Player reads the chapters themselves.
    ...(hasChapters(v.description) ? { chapters: true } : {}),
  };
}

/**
 * Whether a description lists chapters by YouTube's rule (`parseChapters`). The cached channel
 * lists carry full descriptions, so this costs nothing from YouTube.
 * @param {string} [description]
 */
export function hasChapters(description) {
  return !!description && parseChapters(description).length > 0;
}

/**
 * Favorites, newest favorited first. Only videos: a favorites file from
 * before #68 may hold story cards, which have nowhere to play.
 * @param {Data} data
 * @returns {Card[]}
 */
export function favoriteCards(data) {
  return [...data.favorites]
    .filter((f) => f.item.kind === "video")
    .sort((a, b) => b.favoritedAt.localeCompare(a.favoritedAt))
    .map((f) => toCard(f.item));
}

/**
 * One card as the browser draws it.
 * @param {VideoItem} item
 * @returns {Card}
 */
export function toCard(item) {
  return {
    id: item.id,
    title: item.title,
    link: item.link,
    videoId: item.videoId,
    thumbUrl: thumbnailUrl(item.videoId),
    meta: `${item.channel} · ${shortDate(item.publishedAt)}`,
    duration: item.duration ? formatDuration(item.duration) : undefined,
  };
}

/** How long ago a recent video would still say "N days ago" rather than its date. */
const AGO_DAYS = 28;

/**
 * When a video came out: "5 hours ago" or "3 days ago" while it is recent, the date after that.
 * @param {string} iso
 */
function shortDate(iso) {
  const d = new Date(iso);
  const hours = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (hours >= 0 && hours < 24) return hours < 1 ? "just now" : `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days >= 1 && days <= AGO_DAYS) return `${days} ${days === 1 ? "day" : "days"} ago`;
  /** @type {Intl.DateTimeFormatOptions} */
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** @param {number} total */
function formatDuration(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
