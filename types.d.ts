/*
  The shapes that cross module boundaries, in one place. This file has no
  imports or exports, so every type here is global to the checker: a .js file
  names one in a JSDoc comment (`@param {Card} card`) with nothing to import.
  Nothing here runs; `tsc -p jsconfig.json` is the only reader.
*/

type Creator = {
  channelId: string;
  name: string;
  channelUrl: string;
  avatarUrl: string;
};

/** A stored video: what a favorite is a copy of. */
type VideoItem = {
  id: string;
  kind: "video";
  createdAt: string;
  title: string;
  link: string;
  videoId: string;
  channel: string;
  publishedAt: string;
  /** Seconds. Absent when unknown. */
  duration?: number;
  /** Its description lists chapters. Absent when it does not, or was never read. */
  chapters?: true;
};

type Favorite = { item: VideoItem; favoritedAt: string };

type Settings = {
  /** Days of recent videos the Creators page shows. Absent until first changed: DEFAULT_DAYS. */
  creatorsWindowDays?: number;
  /** Leave members-only videos out of everything the app finds: they do not play here. Absent: on. */
  skipMembersOnly?: boolean;
};

type Chapter = { start: number; title: string };

/** What YouTube said, kept on disk so neither a restart nor a reload asks again (#67). */
type YouTubeCache = {
  /** Per channel id: its list and when it was read. Read again after LIST_TTL_HOURS. */
  lists: Record<string, { readAt: string; videos: FeedVideo[] }>;
  /** Per video id: seconds. Never changes. */
  durations: Record<string, number>;
  /** Per video id: the chapters its description lists. Never changes. */
  chapters: Record<string, Chapter[]>;
};

/** Everything the store holds: one JSON file per key. */
type Data = {
  creators: Creator[];
  favorites: Favorite[];
  settings: Settings;
  cache: YouTubeCache;
};

/** What the browser needs to draw one card. */
type Card = {
  id: string;
  title: string;
  link: string;
  videoId: string;
  thumbUrl: string;
  meta: string;
  duration?: string;
};

/* YouTube */

type ChannelInfo = { channelId: string; name: string; channelUrl: string; avatarUrl: string };

type FeedVideo = {
  videoId: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string;
  /** Only the channel's paying members can play it. */
  membersOnly?: true;
};

type ParsedYouTubeUrl =
  | { kind: "video"; videoId: string; url: string }
  | { kind: "handle"; handle: string }
  | { kind: "channel"; channelId: string };

type KeyName = "youtube";

/* Creators page */

type RecentCard = { channelId: string; publishedAt: string; card: Card };

/**
 * `failed`: why there are no cards, when every channel list failed (a used-up
 * quota, most often). `readAt`: when the oldest list in use was read, so the
 * page can say how current it is.
 */
type Recent = { cards: RecentCard[]; readAt?: string; failed?: string };

/* Player */

/** What the player window's bar needs about the video it is playing. */
type PlayerVideo = {
  id: string;
  videoId: string;
  title: string;
  link: string;
  thumbUrl: string;
  /** Unknown only for a video found nowhere in the app. */
  channel?: string;
  /** The saved creator behind this video, when there is one. */
  creator?: { name: string; avatarUrl: string };
  favorited: boolean;
  /** Its description lists chapters: the History row wears the glyph. */
  chapters?: true;
};

/* HTTP */

/** What a route handler is given. `req` and `res` are there for a handler that streams. */
type Ctx = {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, any>;
  req: import("node:http").IncomingMessage;
  res: import("node:http").ServerResponse;
};

/** What a route handler answers with. A handler that wrote to `res` itself returns nothing. */
type Reply = { status: number; body: unknown };
