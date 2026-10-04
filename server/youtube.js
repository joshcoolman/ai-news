import { key } from "./keys.js";
import { ageText, isoDurationSeconds, parseChapters, parseYouTubeUrl } from "./youtube-parse.js";

/*
  Everything the app knows about YouTube lives here, read from the YouTube Data
  API v3. The free quota is 10,000 units a day: a search page costs 100, every
  other call costs 1.

  Two playlist ids the documentation does not list carry real behaviour (both
  checked against every saved creator, October 2026): UULF + the channel id's
  tail is its long-form videos only (no Shorts, no live streams, no members-only
  videos), and UUMO + the tail is its members-only videos, missing (404) for a
  channel that has none. If either stops answering, this is the place to look.
*/

const API = "https://www.googleapis.com/youtube/v3/";

class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class UserInputError extends Error {}

/**
 * @param {string} path
 * @param {Record<string, string>} params
 * @returns {Promise<any>}
 */
async function api(path, params) {
  const res = await fetch(`${API}${path}?${new URLSearchParams({ ...params, key: key("youtube") })}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return res.json();
  /** @type {any} */
  const problem = await res.json().catch(() => null);
  /** @type {string} */
  const reason = problem?.error?.errors?.[0]?.reason ?? "";
  if (reason === "quotaExceeded") throw new Error("YouTube's daily quota is used up; it resets at midnight Pacific.");
  throw new ApiError(res.status, `${res.status}${reason ? ` ${reason}` : ""} from YouTube ${path}`);
}

/** Whether the key in use is accepted: one cheap call (1 unit). */
export async function keyWorks() {
  try {
    await api("i18nLanguages", { part: "snippet", hl: "en" });
    return true;
  } catch {
    return false;
  }
}

/** @param {string} videoId */
export function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * @param {{ id: string } | { forHandle: string }} by
 * @param {string} what
 * @returns {Promise<ChannelInfo>}
 */
async function channel(by, what) {
  const found = (await api("channels", { part: "snippet", ...by })).items?.[0];
  if (!found) throw new Error(`Could not read a channel from ${what}`);
  const t = found.snippet.thumbnails;
  return {
    channelId: found.id,
    name: found.snippet.title,
    channelUrl: `https://www.youtube.com/channel/${found.id}`,
    avatarUrl: (t?.medium ?? t?.default)?.url ?? "",
  };
}

/**
 * Channel details for a known channel id (used to fill in missing avatars).
 * @param {string} channelId
 */
export function channelInfo(channelId) {
  return channel({ id: channelId }, channelId);
}

/**
 * Resolve a creator from a pasted video, Shorts, youtu.be, /@handle or /channel/UC… URL.
 * @param {string} input
 */
export async function resolveCreator(input) {
  const parsed = parseYouTubeUrl(input);
  if (!parsed) throw new UserInputError("That is not a YouTube video or channel URL.");
  if (parsed.kind === "channel") return channelInfo(parsed.channelId);
  if (parsed.kind === "handle") return channel({ forHandle: parsed.handle }, parsed.handle);
  const [video] = await videos([parsed.videoId], "snippet");
  if (!video) throw new Error("YouTube has no video at that URL.");
  return channelInfo(video.snippet.channelId);
}

const LISTED = 30;

/**
 * The latest long-form videos on a channel, newest first, with exact dates and
 * full descriptions: its 30 newest public ones, plus its members-only ones
 * (marked, so `playable` can leave them out).
 * @param {string} channelId
 * @returns {Promise<FeedVideo[]>}
 */
export async function listChannelVideos(channelId) {
  const tail = channelId.slice(2);
  const [open, members] = await Promise.all([playlist(`UULF${tail}`), playlist(`UUMO${tail}`)]);
  const out = [...open, ...members.map((v) => ({ ...v, membersOnly: /** @type {const} */ (true) }))];
  if (!out.length) throw new Error(`${channelId} lists no videos`);
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * A playlist's newest entries; none when the playlist does not exist.
 * @param {string} playlistId
 * @returns {Promise<FeedVideo[]>}
 */
async function playlist(playlistId) {
  /** @type {any[]} */
  let items;
  try {
    items = (await api("playlistItems", { part: "snippet,contentDetails", playlistId, maxResults: String(LISTED) })).items ?? [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
  return items.map((i) => ({
    videoId: i.contentDetails.videoId,
    title: i.snippet.title,
    description: i.snippet.description,
    channel: i.snippet.videoOwnerChannelTitle ?? i.snippet.channelTitle,
    publishedAt: i.contentDetails.videoPublishedAt ?? i.snippet.publishedAt,
  }));
}

/**
 * Up to 50 videos by id, in the order asked. One unit however many.
 * @param {string[]} ids
 * @param {string} part
 * @returns {Promise<any[]>}
 */
async function videos(ids, part) {
  if (!ids.length) return [];
  /** @type {any[]} */
  const items = (await api("videos", { part, id: ids.join(",") })).items ?? [];
  const byId = new Map(items.map((v) => [v.id, v]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

const SEARCH_PAGE = 50;
// Each page is 100 units of the day's 10,000.
const MAX_SEARCH_PAGES = 4;

/**
 * YouTube search, long-form videos only. Returns results `skip` through
 * `skip + count`, paging further down the results as needed. `pastMonth` keeps
 * the last 30 days.
 * @param {string} query
 * @returns {Promise<SearchResult[]>}
 */
export async function search(query, { skip = 0, count = 20, pastMonth = false } = {}) {
  /** @type {Record<string, string>} */
  const params = { part: "id", q: query, type: "video", maxResults: String(SEARCH_PAGE) };
  if (pastMonth) params.publishedAfter = new Date(Date.now() - 30 * 86_400_000).toISOString();
  /** @type {SearchResult[]} */
  const out = [];
  for (let pages = 0; pages < MAX_SEARCH_PAGES; pages++) {
    const page = await api("search", params);
    /** @type {string[]} */
    const ids = (page.items ?? []).flatMap((/** @type {any} */ i) => i.id.videoId ?? []);
    // Search titles arrive HTML-escaped and without lengths; the videos call has both right.
    for (const v of await videos(ids, "snippet,contentDetails,statistics")) {
      const r = toResult(v);
      if (r) out.push(r);
    }
    if (out.length >= skip + count || !page.nextPageToken) break;
    params.pageToken = page.nextPageToken;
  }
  return out.slice(skip, skip + count);
}

/**
 * @param {any} v
 * @returns {SearchResult | null}
 */
function toResult(v) {
  const seconds = isoDurationSeconds(v.contentDetails?.duration);
  // Anything a minute or under is a Short in disguise.
  if (seconds !== undefined && seconds <= 60) return null;
  return {
    videoId: v.id,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    duration: seconds,
    publishedAt: v.snippet.publishedAt,
    ageText: ageText(v.snippet.publishedAt),
    // The API has no members-only field, but it withholds the view count of a members-only video.
    ...(v.statistics && v.statistics.viewCount === undefined && { membersOnly: /** @type {const} */ (true) }),
  };
}

/** A video's chapters never change once read, and the player asks each time it loads. */
/** @type {Map<string, { start: number, title: string }[]>} */
const chapters = new Map();

/**
 * The chapters listed in a video's description; none when it lists none. The
 * API has no chapters of its own, so the ones YouTube generates by itself are
 * out of reach.
 * @param {string} videoId
 */
export async function videoChapters(videoId) {
  const known = chapters.get(videoId);
  if (known) return known;
  const [video] = await videos([videoId], "snippet");
  const found = parseChapters(video?.snippet.description ?? "");
  chapters.set(videoId, found);
  return found;
}

/**
 * Video length in seconds, or undefined when YouTube will not say.
 * @param {string} videoId
 */
export async function videoDuration(videoId) {
  try {
    const [video] = await videos([videoId], "contentDetails");
    return isoDurationSeconds(video?.contentDetails?.duration);
  } catch {
    return undefined;
  }
}
