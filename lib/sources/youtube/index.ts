import "server-only";
import { XMLParser } from "fast-xml-parser";
import { parseYouTubeUrl } from "./parse";

/*
  Everything the app knows about YouTube lives here, using only what YouTube
  serves publicly (no API key). Page scraping can break without notice, so
  callers treat every function as fallible. Swap for the Data API later by
  replacing this module.
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
  /** Approximate publish time derived from "3 days ago". */
  publishedAt?: string;
  ageText?: string;
  /** Only the channel's paying members can play it. */
  membersOnly?: true;
};

// The consent cookie keeps EU addresses from being redirected to a consent page.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "SOCS=CAI",
};

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

async function channelFromPage(url: string): Promise<ChannelInfo> {
  const html = await (await get(url)).text();
  const channelId = html.match(/channel_id=(UC[A-Za-z0-9_-]{22})/)?.[1];
  const name = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const avatar = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
  if (!channelId || !name) throw new Error(`Could not read a channel from ${url}`);
  return {
    channelId,
    name: decodeEntities(name),
    channelUrl: `https://www.youtube.com/channel/${channelId}`,
    avatarUrl: avatar ? decodeEntities(avatar) : "",
  };
}

/** Channel details for a known channel id (used to fill in missing avatars). */
export function channelInfo(channelId: string): Promise<ChannelInfo> {
  return channelFromPage(`https://www.youtube.com/channel/${channelId}`);
}

/** Resolve a creator from a pasted video, Shorts, youtu.be, /@handle or /channel/UC… URL. */
export async function resolveCreator(input: string): Promise<ChannelInfo> {
  const parsed = parseYouTubeUrl(input);
  if (!parsed) throw new UserInputError("That is not a YouTube video or channel URL.");
  if (parsed.kind === "channel") return channelInfo(parsed.channelId);
  if (parsed.kind === "handle") return channelFromPage(`https://www.youtube.com/${parsed.handle}`);
  const res = await get(`https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.url)}&format=json`);
  const { author_url } = (await res.json()) as { author_url?: string };
  if (!author_url) throw new Error("oEmbed returned no channel for that video.");
  return channelFromPage(author_url);
}

export class UserInputError extends Error {}

const xml = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === "entry" });

/**
 * The latest long-form videos (no Shorts) on a channel, newest first: the first
 * page of its Videos tab (30), which never lists Shorts.
 *
 * The tab only says "3 days ago", so the channel's RSS feed (15 entries, exact
 * dates, full descriptions) upgrades every video it covers. YouTube stopped
 * answering the feed for some channels in October 2026 (the Shorts-free
 * playlist form for all of them), so a missing feed is routine, not an error:
 * those videos keep the approximate date and an empty description.
 *
 * Approximate dates are safe for "newer than last seen": an age rounds down,
 * so a video's date is never earlier than when it was really published, and a
 * video found by one refresh never dates later than that refresh.
 */
export async function listChannelVideos(channelId: string): Promise<FeedVideo[]> {
  const [tab, exact] = await Promise.all([channelVideos(channelId), feedEntries(channelId)]);
  // The feed does not say which videos are members only; the tab does.
  return tab.map((v) => ({ ...(exact.get(v.videoId) ?? v), ...(v.membersOnly && { membersOnly: v.membersOnly }) }));
}

/** The channel's Videos tab, newest first, with approximate dates. */
async function channelVideos(channelId: string): Promise<FeedVideo[]> {
  const yt = await innertube();
  const channel = await yt.getChannel(channelId);
  const tab = await channel.getVideos();
  const name = channel.metadata?.title ?? "";
  const out: FeedVideo[] = [];
  for (const v of tab.videos as any[]) {
    const videoId = v.content_id ?? v.video_id ?? v.id;
    if (typeof videoId !== "string") continue;
    const ageText: string | undefined =
      v.published?.toString() ??
      v.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.map((p: any) => p.text?.text).find((t: unknown) => typeof t === "string" && /ago/.test(t));
    out.push({
      videoId,
      title: v.metadata?.title?.text ?? v.title?.toString() ?? "",
      description: "",
      channel: name,
      publishedAt: (ageText && approxDate(ageText)) || new Date().toISOString(),
      ...(membersOnly(v) && { membersOnly: true as const }),
    });
  }
  if (!out.length) throw new Error(`Videos tab of ${channelId} listed nothing`);
  return out;
}

/** The channel feed's entries by video id, or none when YouTube will not serve it. */
async function feedEntries(channelId: string): Promise<Map<string, FeedVideo>> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  let body: string;
  try {
    body = await retry(2, async () => (await get(url)).text());
  } catch {
    return new Map();
  }
  const entries: Record<string, any>[] = xml.parse(body)?.feed?.entry ?? [];
  return new Map(
    entries.map((e) => [
      String(e["yt:videoId"]),
      {
        videoId: String(e["yt:videoId"]),
        title: text(e.title),
        description: text(e["media:group"]?.["media:description"]),
        channel: text(e.author?.name),
        publishedAt: new Date(text(e.published)).toISOString(),
      },
    ]),
  );
}

async function retry<T>(times: number, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let n = 0; n < times; n++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

type Innertube = Awaited<ReturnType<typeof import("youtubei.js").Innertube.create>>;
const g = globalThis as typeof globalThis & { __innertube?: Promise<Innertube> };

function innertube(): Promise<Innertube> {
  if (!g.__innertube) {
    g.__innertube = import("youtubei.js").then(({ Innertube }) => Innertube.create({ retrieve_player: false }));
    g.__innertube.catch(() => (g.__innertube = undefined));
  }
  return g.__innertube;
}

/**
 * Keyless YouTube search, long-form videos only. Returns results `skip` through
 * `skip + count`, paging further down the results as needed. `pastMonth` uses
 * YouTube's own upload-date filter.
 */
export async function search(
  query: string,
  { skip = 0, count = 20, pastMonth = false } = {},
): Promise<SearchResult[]> {
  const yt = await innertube();
  let page = await yt.search(query, { type: "video", ...(pastMonth ? { upload_date: "month" as const } : {}) });
  const out: SearchResult[] = [];
  for (let pages = 0; pages < 6; pages++) {
    for (const v of page.videos) {
      if (v.type !== "Video") continue;
      const r = toResult(v as any);
      if (r) out.push(r);
    }
    if (out.length >= skip + count || !page.has_continuation) break;
    page = await page.getContinuation();
  }
  return out.slice(skip, skip + count);
}

function toResult(v: any): SearchResult | null {
  const videoId = v.video_id ?? v.id;
  if (!videoId) return null;
  const seconds = v.duration?.seconds;
  // Anything a minute or under is a Short in disguise.
  if (typeof seconds === "number" && seconds > 0 && seconds <= 60) return null;
  const ageText = v.published?.toString();
  return {
    videoId,
    title: v.title?.toString() ?? "",
    channel: v.author?.name ?? "",
    duration: typeof seconds === "number" && seconds > 0 ? seconds : undefined,
    ageText,
    publishedAt: ageText ? approxDate(ageText) : undefined,
    ...(membersOnly(v) && { membersOnly: true as const }),
  };
}

/** YouTube marks a members-only video with a badge: among a Videos tab entry's metadata rows, or on a search result itself. */
function membersOnly(v: any): boolean {
  const badges: any[] = [...(v.badges ?? []), ...(v.metadata?.metadata?.metadata_rows ?? []).flatMap((r: any) => r.badges ?? [])];
  return badges.some((b) => /MEMBERS_ONLY/.test(b?.style ?? ""));
}

/** Video length in seconds, or undefined when YouTube will not say. */
export async function videoDuration(videoId: string): Promise<number | undefined> {
  try {
    const yt = await innertube();
    const info = await yt.getBasicInfo(videoId);
    const d = info.basic_info.duration;
    return typeof d === "number" && d > 0 ? d : undefined;
  } catch {
    return undefined;
  }
}

function approxDate(ago: string): string | undefined {
  const m = ago.match(/(\d+)\s*(second|minute|hour|day|week|month|year|mo|yr|d|h|w|y)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const day = 86_400_000;
  const ms =
    unit.startsWith("sec") ? 1000 :
    unit.startsWith("min") ? 60_000 :
    unit.startsWith("h") ? 3_600_000 :
    unit.startsWith("d") ? day :
    unit.startsWith("w") ? 7 * day :
    unit.startsWith("mo") ? 30 * day :
    365 * day;
  return new Date(Date.now() - n * ms).toISOString();
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "#text" in (v as object)) return String((v as { "#text": unknown })["#text"]);
  return String(v);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
