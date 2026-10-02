export type Creator = {
  channelId: string;
  name: string;
  channelUrl: string;
  avatarUrl: string;
  guidance: string;
  /** Publish time of the newest video seen in the channel feed. Absent until the first fetch. */
  newestSeen?: string;
};

export type AvoidEntry = {
  id: string;
  reason: string;
  fromItemId: string;
  fromTitle: string;
  addedAt: string;
};

/** Why a refresh held an item back: an avoid entry, or the creator's guidance. */
export type HiddenBy =
  | { kind: "avoid"; avoidId: string; text: string }
  | { kind: "guidance"; text: string };

type ItemBase = {
  id: string;
  /** Refresh batch. Absent on "more like this" results. */
  batch?: number;
  createdAt: string;
  title: string;
  link: string;
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
};

export type Data = {
  creators: Creator[];
  items: Item[];
  avoid: AvoidEntry[];
  favorites: Favorite[];
  settings: Settings;
};
