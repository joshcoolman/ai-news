import { describe, expect, it } from "vitest";
import type { Item, StoryItem, VideoItem } from "../store/types";
import { displayOrder, latestBatch, maxBatch, mergeBatch, normalizeUrl, treeOrder } from "./rules";

let clock = 0;
const at = () => new Date(Date.UTC(2026, 9, 1, 0, 0, clock++)).toISOString();

const video = (id: string, extra: Partial<VideoItem> = {}): VideoItem => ({
  id,
  kind: "video",
  createdAt: at(),
  title: id,
  link: `https://www.youtube.com/watch?v=${id}`,
  videoId: id,
  channel: "c",
  publishedAt: at(),
  ...extra,
});
const story = (id: string, extra: Partial<StoryItem> = {}): StoryItem => ({
  id,
  kind: "story",
  createdAt: at(),
  title: id,
  link: `https://example.com/${id}`,
  label: id,
  topic: "t",
  sourceDomain: "example.com",
  ...extra,
});
const ids = (items: Item[]) => items.map((i) => i.id);

describe("mergeBatch", () => {
  it("puts the new batch in front and keeps every earlier card", () => {
    const items: Item[] = [];
    mergeBatch(items, [video("a"), story("b")], 1);
    mergeBatch(items, [video("c"), story("d")], 2);
    expect(ids(displayOrder(items))).toEqual(["c", "d", "a", "b"]);
  });

  it("never re-adds a removed card", () => {
    const items: Item[] = [];
    mergeBatch(items, [video("a")], 1);
    items[0].removedAt = at();
    const added = mergeBatch(items, [video("a"), video("b")], 2);
    expect(ids(added)).toEqual(["b"]);
    expect(items.filter((i) => i.id === "a")).toHaveLength(1);
    expect(items[0].removedAt).toBeDefined();
    expect(ids(displayOrder(items))).toEqual(["b"]);
  });

  it("an empty refresh creates no batch and leaves New where it was", () => {
    const items: Item[] = [];
    mergeBatch(items, [video("a")], 1);
    expect(mergeBatch(items, [], 2)).toEqual([]);
    expect(mergeBatch(items, [video("a")], 2)).toEqual([]);
    expect(latestBatch(items)).toBe(1);
  });

  it("puts New only on the latest batch", () => {
    const items: Item[] = [];
    mergeBatch(items, [video("a")], 1);
    mergeBatch(items, [video("b")], 2);
    expect(latestBatch(items)).toBe(2);
    expect(items.find((i) => i.id === "a")!.batch).toBe(1);
  });

  it("a batch that is entirely hidden does not move New, but still uses its number", () => {
    const items: Item[] = [];
    mergeBatch(items, [video("a")], 1);
    mergeBatch(items, [video("b", { hiddenBy: { kind: "guidance", text: "only announcements" } })], 2);
    expect(latestBatch(items)).toBe(1);
    expect(maxBatch(items)).toBe(2);
    expect(ids(displayOrder(items))).toEqual(["a"]);
  });

  it("more-like-this results never change which batch is latest", () => {
    const items: Item[] = [];
    mergeBatch(items, [video("a")], 1);
    items.push(video("m1", { after: "a" }));
    expect(latestBatch(items)).toBe(1);
  });
});

describe("displayOrder", () => {
  it("walks the tree: each card, then its results in the order added, each followed by its own", () => {
    const items: Item[] = [];
    mergeBatch(items, [story("a"), story("b")], 1);
    items.push(video("a1", { after: "a" }), video("a2", { after: "a" }));
    items.push(video("a1x", { after: "a1" }));
    items.push(video("b1", { after: "b" }));
    items.push(video("a3", { after: "a" })); // a second click on "a", added later
    expect(ids(displayOrder(items))).toEqual(["a", "a1", "a1x", "a2", "a3", "b", "b1"]);
  });

  it("keeps results in place under a removed parent", () => {
    const items: Item[] = [];
    mergeBatch(items, [story("a"), story("b")], 1);
    items.push(video("a1", { after: "a" }), video("a2", { after: "a" }));
    items.push(video("a1x", { after: "a1" }));
    items.find((i) => i.id === "a")!.removedAt = at();
    items.find((i) => i.id === "a1")!.removedAt = at();
    expect(ids(displayOrder(items))).toEqual(["a1x", "a2", "b"]);
  });

  it("results follow their parent even when it is in an older batch", () => {
    const items: Item[] = [];
    mergeBatch(items, [story("old")], 1);
    items.push(video("o1", { after: "old" }));
    mergeBatch(items, [story("new")], 2);
    expect(ids(displayOrder(items))).toEqual(["new", "old", "o1"]);
  });
});

describe("normalizeUrl", () => {
  it("ignores scheme, www., trailing slash and tracking parameters", () => {
    const a = normalizeUrl("https://www.openai.com/index/introducing-dots/?utm_source=x&utm_medium=y");
    const b = normalizeUrl("http://openai.com/index/introducing-dots");
    expect(a).toBe(b);
  });

  it("keeps meaningful query parameters", () => {
    expect(normalizeUrl("https://example.com/p?id=1")).not.toBe(normalizeUrl("https://example.com/p?id=2"));
  });
});

describe("treeOrder", () => {
  it("keeps the results of a deleted parent, as top-level cards", () => {
    // Favorites: "a" had results r1, r2, then "a" itself was deleted.
    const items = [video("b"), video("r1", { after: "a" }), video("r2", { after: "a" })];
    const newestFirst = (x: Item, y: Item) => y.createdAt.localeCompare(x.createdAt);
    expect(ids(treeOrder(items, newestFirst))).toEqual(["r2", "r1", "b"]);
  });
});
