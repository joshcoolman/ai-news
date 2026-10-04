import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { neighbor, nextUp, queueAfter } from "../browser/player/queue.js";

const entry = (/** @type {string} */ videoId) => ({ videoId, title: videoId, thumbUrl: "" });
const ids = (/** @type {{ videoId: string }[]} */ list) => list.map((e) => e.videoId);
const list = ["new", "playing", "old1", "old2"].map(entry);

describe("queueAfter", () => {
  it("puts a queued video directly under the one playing, so the latest queued is next", () => {
    const once = queueAfter(list, "playing", entry("a"));
    assert.deepStrictEqual(ids(once), ["new", "playing", "a", "old1", "old2"]);
    assert.deepStrictEqual(ids(queueAfter(once, "playing", entry("b"))), ["new", "playing", "b", "a", "old1", "old2"]);
  });

  it("moves a video already in the list instead of listing it twice", () => {
    assert.deepStrictEqual(ids(queueAfter(list, "playing", entry("old2"))), ["new", "playing", "old2", "old1"]);
    assert.deepStrictEqual(ids(queueAfter(list, "playing", entry("new"))), ["playing", "new", "old1", "old2"]);
  });

  it("leaves the list alone when the playing video itself is queued", () => {
    assert.deepStrictEqual(queueAfter(list, "playing", entry("playing")), list);
  });
});

describe("nextUp", () => {
  it("is the row under the playing video", () => {
    assert.strictEqual(nextUp(list, "playing", new Set())?.videoId, "old1");
  });

  it("skips rows already watched to the end, so old history does not replay", () => {
    assert.strictEqual(nextUp(list, "playing", new Set(["old1"]))?.videoId, "old2");
    assert.strictEqual(nextUp(list, "playing", new Set(["old1", "old2"])), undefined);
  });

  it("never goes back up the column, and is nothing at the bottom", () => {
    assert.strictEqual(nextUp(list, "old2", new Set()), undefined);
  });
});

describe("neighbor", () => {
  it("steps to the row below or above", () => {
    assert.strictEqual(neighbor(list, "playing", 1)?.videoId, "old1");
    assert.strictEqual(neighbor(list, "playing", -1)?.videoId, "new");
  });

  it("wraps at both ends", () => {
    assert.strictEqual(neighbor(list, "old2", 1)?.videoId, "new");
    assert.strictEqual(neighbor(list, "new", -1)?.videoId, "old2");
  });

  it("has nowhere to go from the only row", () => {
    assert.strictEqual(neighbor([entry("playing")], "playing", 1), undefined);
  });
});
