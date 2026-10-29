import { key } from "./keys.js";
import { isoDurationSeconds, parseChapters, parseXUrl, parseYouTubeUrl } from "./youtube-parse.js";

/*
  Everything the app knows about YouTube lives here, read from the YouTube Data
  API v3, but for a channel's About page (`channelXUrl`), which the API does
  not carry and which costs no unit. The free quota is 10,000 units a day; every call here costs 1 (search,
  at 100 a page, is gone with #68). `[youtube]` log lines count the day's units,
  so when the quota runs out the server log says what spent it (#67).

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

/** The day's spend, by Pacific date (the quota resets at midnight Pacific). In memory: a restart starts it over. */
const spent = { day: "", units: 0 };

/** @param {string} path */
function count(path) {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (spent.day !== day) Object.assign(spent, { day, units: 0 });
  spent.units += 1;
  console.log(`[youtube] ${path}: ${spent.units} units today`);
}

/**
 * @param {string} path
 * @param {Record<string, string>} params
 * @returns {Promise<any>}
 */
async function api(path, params) {
  count(path);
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
 * Channel details for a known channel id.
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

/**
 * The X profile a channel's About page links, or undefined when it links none
 * (#91). The Data API does not carry a channel's links, so this is one plain
 * request for the About page, outside the API and its quota, as transcripts
 * are (#85). The caller reads it once a creator. A page with no About data at
 * all means YouTube moved it: logged, so the empty links have an explanation.
 * @param {string} channelId
 */
export async function channelXUrl(channelId) {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/about`, {
    headers: { "accept-language": "en" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} from ${channelId}'s About page`);
  const html = await res.text();
  if (!html.includes("aboutChannelViewModel")) console.warn(`[links] ${channelId}: no About data, changed shape?`);
  return parseXUrl(html);
}

const LISTED = 30;

/**
 * The latest long-form videos on a channel, newest first, with exact dates and
 * full descriptions: its 30 newest public ones, plus its members-only ones
 * (marked, so `playable` can leave them out). Two units.
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

/**
 * The chapters listed in a video's description; none when it lists none. The
 * API has no chapters of its own, so the ones YouTube generates by itself are
 * out of reach. One unit; the caller caches, since chapters never change.
 * @param {string} videoId
 * @returns {Promise<Chapter[]>}
 */
export async function videoChapters(videoId) {
  const [video] = await videos([videoId], "snippet");
  return parseChapters(video?.snippet.description ?? "");
}

/**
 * Lengths in seconds for many videos, 50 to a request (the most the API takes), the requests in parallel. A video that fails is left out.
 * @param {string[]} ids
 * @returns {Promise<Map<string, number>>}
 */
export async function videoDurations(ids) {
  /** @type {Map<string, number>} */
  const out = new Map();
  const chunks = Array.from({ length: Math.ceil(ids.length / 50) }, (_, n) => ids.slice(n * 50, n * 50 + 50));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        for (const v of await videos(chunk, "contentDetails")) {
          const d = isoDurationSeconds(v.contentDetails?.duration);
          if (d !== undefined) out.set(v.id, d);
        }
      } catch {}
    }),
  );
  return out;
}
