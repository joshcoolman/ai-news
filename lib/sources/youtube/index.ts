import "server-only";
import { ageText, isoDurationSeconds, parseYouTubeUrl } from "./parse";

/*
  Everything the app knows about YouTube lives here, read from the YouTube Data
  API v3 with YOUTUBE_API_KEY. The free quota is 10,000 units a day: a search
  page costs 100, every other call costs 1.

  Two playlist ids the documentation does not list carry real behaviour (both
  checked against every saved creator, October 2026): UULF + the channel id's
  tail is its long-form videos only (no Shorts, no live streams, no members-only
  videos), and UUMO + the tail is its members-only videos, missing (404) for a
  channel that has none. If either stops answering, this is the place to look.
*/

export { parseYouTubeUrl } from "./parse";

export type ChannelInfo = { channelId: string; name: string; channelUrl: string; avatarUrl: string };

export type FeedVideo = {
  videoId: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string;
  /** Only the channel's paying members can play it. */
  membersOnly?: true;
};

export type SearchResult = {
  videoId: string;
  title: string;
  channel: string;
  /** Seconds, when known. */
  duration?: number;
  publishedAt?: string;
  /** "3 days ago", for the prompt that picks among results. */
  ageText?: string;
  /** Only the channel's paying members can play it. */
  membersOnly?: true;
};

const API = "https://www.googleapis.com/youtube/v3/";

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set (.env.local)");
  const res = await fetch(`${API}${path}?${new URLSearchParams({ ...params, key })}`, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.ok) return (await res.json()) as T;
  const reason: string = (await res.json().catch(() => null))?.error?.errors?.[0]?.reason ?? "";
  if (reason === "quotaExceeded") throw new Error("YouTube's daily quota is used up; it resets at midnight Pacific.");
  throw new ApiError(res.status, `${res.status}${reason ? ` ${reason}` : ""} from YouTube ${path}`);
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Thumbnails = Record<string, { url: string } | undefined>;
type ChannelResource = { id: string; snippet: { title: string; thumbnails?: Thumbnails } };
type PlaylistItem = {
  snippet: { title: string; description: string; publishedAt: string; channelTitle: string; videoOwnerChannelTitle?: string };
  contentDetails: { videoId: string; videoPublishedAt?: string };
};
type VideoResource = {
  id: string;
  snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

async function channel(by: { id: string } | { forHandle: string }, what: string): Promise<ChannelInfo> {
  const { items } = await api<{ items?: ChannelResource[] }>("channels", { part: "snippet", ...by });
  const found = items?.[0];
  if (!found) throw new Error(`Could not read a channel from ${what}`);
  const t = found.snippet.thumbnails;
  return {
    channelId: found.id,
    name: found.snippet.title,
    channelUrl: `https://www.youtube.com/channel/${found.id}`,
    avatarUrl: (t?.medium ?? t?.default)?.url ?? "",
  };
}

/** Channel details for a known channel id (used to fill in missing avatars). */
export function channelInfo(channelId: string): Promise<ChannelInfo> {
  return channel({ id: channelId }, channelId);
}

/** Resolve a creator from a pasted video, Shorts, youtu.be, /@handle or /channel/UC… URL. */
export async function resolveCreator(input: string): Promise<ChannelInfo> {
  const parsed = parseYouTubeUrl(input);
  if (!parsed) throw new UserInputError("That is not a YouTube video or channel URL.");
  if (parsed.kind === "channel") return channelInfo(parsed.channelId);
  if (parsed.kind === "handle") return channel({ forHandle: parsed.handle }, parsed.handle);
  const [video] = await videos([parsed.videoId], "snippet");
  if (!video) throw new Error("YouTube has no video at that URL.");
  return channelInfo(video.snippet.channelId);
}

export class UserInputError extends Error {}

const LISTED = 30;

/**
 * The latest long-form videos on a channel, newest first, with exact dates and
 * full descriptions: its 30 newest public ones, plus its members-only ones
 * (marked, so `playable` can leave them out).
 */
export async function listChannelVideos(channelId: string): Promise<FeedVideo[]> {
  const tail = channelId.slice(2);
  const [open, members] = await Promise.all([playlist(`UULF${tail}`), playlist(`UUMO${tail}`)]);
  const out = [...open, ...members.map((v) => ({ ...v, membersOnly: true as const }))];
  if (!out.length) throw new Error(`${channelId} lists no videos`);
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** A playlist's newest entries; none when the playlist does not exist. */
async function playlist(playlistId: string): Promise<FeedVideo[]> {
  let items: PlaylistItem[];
  try {
    ({ items = [] } = await api<{ items?: PlaylistItem[] }>("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: String(LISTED),
    }));
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

/** Up to 50 videos by id, in the order asked. One unit however many. */
async function videos(ids: string[], part: string): Promise<VideoResource[]> {
  if (!ids.length) return [];
  const { items = [] } = await api<{ items?: VideoResource[] }>("videos", { part, id: ids.join(",") });
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
 */
export async function search(
  query: string,
  { skip = 0, count = 20, pastMonth = false } = {},
): Promise<SearchResult[]> {
  const params: Record<string, string> = {
    part: "id",
    q: query,
    type: "video",
    maxResults: String(SEARCH_PAGE),
    ...(pastMonth && { publishedAfter: new Date(Date.now() - 30 * 86_400_000).toISOString() }),
  };
  const out: SearchResult[] = [];
  let pageToken: string | undefined;
  for (let pages = 0; pages < MAX_SEARCH_PAGES; pages++) {
    const page = await api<{ items?: { id: { videoId?: string } }[]; nextPageToken?: string }>("search", {
      ...params,
      ...(pageToken && { pageToken }),
    });
    const ids = (page.items ?? []).flatMap((i) => i.id.videoId ?? []);
    // Search titles arrive HTML-escaped and without lengths; the videos call has both right.
    for (const v of await videos(ids, "snippet,contentDetails,statistics")) {
      const r = toResult(v);
      if (r) out.push(r);
    }
    pageToken = page.nextPageToken;
    if (out.length >= skip + count || !pageToken) break;
  }
  return out.slice(skip, skip + count);
}

function toResult(v: VideoResource): SearchResult | null {
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
    ...(v.statistics && v.statistics.viewCount === undefined && { membersOnly: true as const }),
  };
}

/** Video length in seconds, or undefined when YouTube will not say. */
export async function videoDuration(videoId: string): Promise<number | undefined> {
  try {
    const [video] = await videos([videoId], "contentDetails");
    return isoDurationSeconds(video?.contentDetails?.duration);
  } catch {
    return undefined;
  }
}
