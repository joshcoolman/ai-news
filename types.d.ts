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
  guidance: string;
  /** Publish time of the newest video seen in the channel's list. Absent until the first fetch. */
  newestSeen?: string;
};

/** Why a refresh held an item back: it did not fit the creator's guidance. Held items are stored, never shown. */
type HiddenBy = { kind: "guidance"; text: string };

type ItemBase = {
  id: string;
  /** Refresh batch. Absent on "more like this" results. */
  batch?: number;
  createdAt: string;
  title: string;
  link: string;
  /** Set on cards a home-page search added: the query as typed. Feed-only; a favorite drops it. */
  searchQuery?: string;
  /** The card a "more like this" result belongs to. */
  after?: string;
  removedAt?: string;
  hiddenBy?: HiddenBy;
  /** "More like this" state for this card: the query used and how far down its results we have looked. */
  moreQuery?: string;
  moreSeen?: number;
  /** Short name for this card in its results' meta line ("More like <label>"). Stories use `label`. */
  moreLabel?: string;
};

type VideoItem = ItemBase & {
  kind: "video";
  videoId: string;
  channel: string;
  publishedAt: string;
  /** Seconds. Absent when unknown. */
  duration?: number;
};

type StoryItem = ItemBase & {
  kind: "story";
  label: string;
  topic: string;
  sourceDomain: string;
};

type Item = VideoItem | StoryItem;

/** A copy of a card, independent of the feed: deleting one never touches the other. */
type Favorite = { item: Item; favoritedAt: string };

type Settings = {
  /** What favoriting does to the card in the feed. */
  onFavorite: "ask" | "remove" | "keep";
  /** Days of recent videos the Creators page shows. Absent until first changed: DEFAULT_DAYS. */
  creatorsWindowDays?: number;
  /** Leave members-only videos out of everything the app finds: they do not play here. Absent: on. */
  skipMembersOnly?: boolean;
};

/** Everything the store holds: one JSON file per key. */
type Data = {
  creators: Creator[];
  items: Item[];
  favorites: Favorite[];
  settings: Settings;
};

/** What the browser needs to draw one card. */
type Card = {
  id: string;
  kind: "video" | "story";
  title: string;
  link: string;
  /** Video cards: plays in the app's player window. */
  videoId?: string;
  /** Video cards: the real thumbnail. Story cards: a label drawn on a colour block. */
  thumbUrl?: string;
  label?: string;
  meta: string;
  duration?: string;
  isNew: boolean;
  /** A copy is in Favorites. */
  favorited?: boolean;
};

type FeedView = { cards: Card[] };

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

type SearchResult = {
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

type ParsedYouTubeUrl =
  | { kind: "video"; videoId: string; url: string }
  | { kind: "handle"; handle: string }
  | { kind: "channel"; channelId: string };

/* Claude */

type KeyName = "anthropic" | "youtube";

type Usage = { input: number; output: number; searches: number; fetches: number };

/** One block of a Claude message, as the API sends it. Read by `type`; the rest varies. */
type ContentBlock = { type: string; [field: string]: any };

type ClaudeMessage = {
  content: ContentBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
  };
};

type Lane = { id: string; name: string; brief: string };

type Story = { label: string; title: string; sourceUrl: string; topic: string };

type StoriesInput = {
  /** Titles of creator videos from the last 7 days. */
  creatorTitles: { channel: string; title: string; publishedAt: string }[];
  /** Cards from the last 30 days, removed ones included. */
  recentCards: { label: string; title: string; link: string }[];
};

/*
  The refresh's event log, streamed to the browser over SSE and replayed in
  full on reconnect. The browser builds its live view from these alone.
*/
type RefreshEvent =
  | { type: "start"; batch: number; startedAt: string; creators: { id: string; name: string }[] }
  /** A creator's new videos. `checking` while the guidance filter still has to run. */
  | { type: "videos"; creatorId: string; cards: Card[]; checking: boolean }
  | { type: "creator-failed"; creatorId: string }
  /** The filter ran: these cards were held back (dropped from view); the rest are confirmed. */
  | { type: "filtered"; heldIds: string[] }
  | { type: "lanes"; lanes: Lane[]; slots: number }
  | { type: "activity"; laneId: string; text: string }
  | { type: "stories"; laneId: string; cards: Card[] }
  | { type: "lane-done"; laneId: string; error?: string; cancelled?: boolean }
  | { type: "cost"; usd: number; searches: number }
  | {
      type: "done";
      videos: number;
      stories: number;
      failed: string[];
      seconds: number;
      usd: number;
      cancelled: boolean;
      error?: string;
    };

/* Creators page */

type RecentCard = { channelId: string; publishedAt: string; card: Card };

/** Per channel: whether its list came back full, and the oldest video it showed. Tells the page when a count may be cut off. */
type FeedReach = { channelId: string; full: boolean; oldest?: string };

type Recent = { cards: RecentCard[]; reach: FeedReach[] };

/** A topic as the page uses it: card ids (as on the Creators page), so the browser can filter its grid. */
type PageTopic = { name: string; ids: string[] };

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
  /** A card on home (not held back), so favoriting can remove it there and unfavoriting restore it. */
  inFeed: boolean;
  removed: boolean;
  favorited: boolean;
  onFavorite: Settings["onFavorite"];
};

/* HTTP */

/** What a route handler is given. `req` and `res` are there for the one handler that streams. */
type Ctx = {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, any>;
  req: import("node:http").IncomingMessage;
  res: import("node:http").ServerResponse;
};

/** What a route handler answers with. A handler that wrote to `res` itself returns nothing. */
type Reply = { status: number; body: unknown };
