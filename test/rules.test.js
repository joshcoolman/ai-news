import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayOrder, favoriteCopy, firstUnstored, latestBatch, maxBatch, mergeBatch, normalizeUrl, playable, treeOrder } from "../server/feed/rules.js";

let clock = 0;
const at = () => new Date(Date.UTC(2026, 9, 1, 0, 0, clock++)).toISOString();

/**
 * @param {string} id
 * @param {Partial<VideoItem>} [extra]
 * @returns {VideoItem}
 */
const video = (id, extra = {}) => ({
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
/**
 * @param {string} id
 * @param {Partial<StoryItem>} [extra]
 * @returns {StoryItem}
 */
const story = (id, extra = {}) => ({
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
/**
 * @param {Item[]} items
 * @param {string} id
 */
const byId = (items, id) => {
  const item = items.find((i) => i.id === id);
  assert.ok(item);
  return item;
};
const ids = (/** @type {{ id: string }[]} */ items) => items.map((i) => i.id);

describe("mergeBatch", () => {
  it("puts the new batch in front and keeps every earlier card", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [video("a"), story("b")], 1);
    mergeBatch(items, [video("c"), story("d")], 2);
    assert.deepStrictEqual(ids(displayOrder(items)), ["c", "d", "a", "b"]);
  });

  it("never re-adds a removed card", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [video("a")], 1);
    items[0].removedAt = at();
    const added = mergeBatch(items, [video("a"), video("b")], 2);
    assert.deepStrictEqual(ids(added), ["b"]);
    assert.strictEqual(items.filter((i) => i.id === "a").length, 1);
    assert.notStrictEqual(items[0].removedAt, undefined);
    assert.deepStrictEqual(ids(displayOrder(items)), ["b"]);
  });

  it("an empty refresh creates no batch and leaves New where it was", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [video("a")], 1);
    assert.deepStrictEqual(mergeBatch(items, [], 2), []);
    assert.deepStrictEqual(mergeBatch(items, [video("a")], 2), []);
    assert.strictEqual(latestBatch(items), 1);
  });

  it("puts New only on the latest batch", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [video("a")], 1);
    mergeBatch(items, [video("b")], 2);
    assert.strictEqual(latestBatch(items), 2);
    assert.strictEqual(byId(items, "a").batch, 1);
  });

  it("a batch that is entirely hidden does not move New, but still uses its number", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [video("a")], 1);
    mergeBatch(items, [video("b", { hiddenBy: { kind: "guidance", text: "only announcements" } })], 2);
    assert.strictEqual(latestBatch(items), 1);
    assert.strictEqual(maxBatch(items), 2);
    assert.deepStrictEqual(ids(displayOrder(items)), ["a"]);
  });

  it("more-like-this results never change which batch is latest", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [video("a")], 1);
    items.push(video("m1", { after: "a" }));
    assert.strictEqual(latestBatch(items), 1);
  });
});

describe("displayOrder", () => {
  it("walks the tree: each card, then its results in the order added, each followed by its own", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [story("a"), story("b")], 1);
    items.push(video("a1", { after: "a" }), video("a2", { after: "a" }));
    items.push(video("a1x", { after: "a1" }));
    items.push(video("b1", { after: "b" }));
    items.push(video("a3", { after: "a" })); // a second click on "a", added later
    assert.deepStrictEqual(ids(displayOrder(items)), ["a", "a1", "a1x", "a2", "a3", "b", "b1"]);
  });

  it("keeps results in place under a removed parent", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [story("a"), story("b")], 1);
    items.push(video("a1", { after: "a" }), video("a2", { after: "a" }));
    items.push(video("a1x", { after: "a1" }));
    byId(items, "a").removedAt = at();
    byId(items, "a1").removedAt = at();
    assert.deepStrictEqual(ids(displayOrder(items)), ["a1x", "a2", "b"]);
  });

  it("results follow their parent even when it is in an older batch", () => {
    const items = /** @type {Item[]} */ ([]);
    mergeBatch(items, [story("old")], 1);
    items.push(video("o1", { after: "old" }));
    mergeBatch(items, [story("new")], 2);
    assert.deepStrictEqual(ids(displayOrder(items)), ["new", "old", "o1"]);
  });
});

describe("normalizeUrl", () => {
  it("ignores scheme, www., trailing slash and tracking parameters", () => {
    const a = normalizeUrl("https://www.openai.com/index/introducing-dots/?utm_source=x&utm_medium=y");
    const b = normalizeUrl("http://openai.com/index/introducing-dots");
    assert.strictEqual(a, b);
  });

  it("keeps meaningful query parameters", () => {
    assert.notStrictEqual(normalizeUrl("https://example.com/p?id=1"), normalizeUrl("https://example.com/p?id=2"));
  });
});

describe("treeOrder", () => {
  it("keeps the results of a deleted parent, as top-level cards", () => {
    // Favorites: "a" had results r1, r2, then "a" itself was deleted.
    const items = [video("b"), video("r1", { after: "a" }), video("r2", { after: "a" })];
    const newestFirst = (/** @type {Item} */ x, /** @type {Item} */ y) => y.createdAt.localeCompare(x.createdAt);
    assert.deepStrictEqual(ids(treeOrder(items, newestFirst)), ["r2", "r1", "b"]);
  });
});

describe("firstUnstored", () => {
  it("skips stored videos, removed ones included, and stops at the count", () => {
    const items = [video("a"), video("b", { removedAt: at() })];
    const results = ["a", "b", "c", "c", "d", "e"].map((videoId) => ({ videoId }));
    assert.deepStrictEqual(firstUnstored(items, results, 2).map((r) => r.videoId), ["c", "d"]);
  });
});

describe("favoriteCopy", () => {
  it("drops feed-only state, so restoring or removing the feed card never touches the favorite", () => {
    const copy = favoriteCopy(video("a", { batch: 3, after: "b", removedAt: at(), searchQuery: "q", moreQuery: "m", moreSeen: 20 }));
    assert.ok(!("removedAt" in copy));
    assert.ok(!("after" in copy));
    assert.ok(!("batch" in copy));
    assert.partialDeepStrictEqual(copy, { id: "a", videoId: "a", channel: "c" });
  });
});

describe("playable", () => {
  const videos = [{ videoId: "a" }, { videoId: "b", membersOnly: true }];

  it("drops members-only videos by default", () => {
    assert.deepStrictEqual(playable(videos, {}), [{ videoId: "a" }]);
  });

  it("keeps them when the setting is off", () => {
    assert.strictEqual(playable(videos, { skipMembersOnly: false }).length, 2);
  });
});
