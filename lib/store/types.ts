export type Creator = {
  channelId: string;
  name: string;
  channelUrl: string;
  avatarUrl: string;
  guidance: string;
  /** Publish time of the newest video seen in the channel feed. Absent until the first fetch. */
  newestSeen?: string;
};

/** Why a refresh held an item back: it did not fit the creator's guidance. Held items are stored, never shown. */
export type HiddenBy = { kind: "guidance"; text: string };

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

export type VideoItem = ItemBase & {
  kind: "video";
  videoId: string;
  channel: string;
  publishedAt: string;
  /** Seconds. Absent when unknown. */
  duration?: number;
};

export type StoryItem = ItemBase & {
  kind: "story";
  label: string;
  topic: string;
  sourceDomain: string;
};

export type Item = VideoItem | StoryItem;

/** A copy of a card, independent of the feed: deleting one never touches the other. */
export type Favorite = { item: Item; favoritedAt: string };

export type Settings = {
  /** What favoriting does to the card in the feed. */
  onFavorite: "ask" | "remove" | "keep";
  /** Days of recent videos the Creators page shows. Absent until first changed: DEFAULT_DAYS. */
  creatorsWindowDays?: number;
};

export type Data = {
  creators: Creator[];
  items: Item[];
  favorites: Favorite[];
  settings: Settings;
};
