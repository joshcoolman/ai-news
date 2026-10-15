import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { movePick, nextPick } from "../browser/feed/pick.js";

const ids = ["a", "b", "c", "d", "e"];

describe("nextPick", () => {
  it("is the card after the one leaving", () => {
    assert.strictEqual(nextPick(ids, "b"), "c");
  });

  it("wraps to the first from the last", () => {
    assert.strictEqual(nextPick(ids, "e"), "a");
  });

  it("is nothing when the leaving card was the only one, or is not in the grid", () => {
    assert.strictEqual(nextPick(["a"], "a"), undefined);
    assert.strictEqual(nextPick(ids, "zz"), undefined);
  });
});

describe("movePick", () => {
  it("starts at the first card when nothing is picked", () => {
    assert.strictEqual(movePick(ids, null, "ArrowDown", 2), "a");
    assert.strictEqual(movePick([], null, "ArrowDown", 2), undefined);
  });

  it("moves one card left or right, a row up or down", () => {
    assert.strictEqual(movePick(ids, "b", "ArrowRight", 2), "c");
    assert.strictEqual(movePick(ids, "b", "ArrowLeft", 2), "a");
    assert.strictEqual(movePick(ids, "b", "ArrowDown", 2), "d");
    assert.strictEqual(movePick(ids, "d", "ArrowUp", 2), "b");
  });

  it("stops at the grid's ends", () => {
    assert.strictEqual(movePick(ids, "a", "ArrowLeft", 2), "a");
    assert.strictEqual(movePick(ids, "e", "ArrowRight", 2), "e");
    assert.strictEqual(movePick(ids, "d", "ArrowDown", 2), "d");
    assert.strictEqual(movePick(ids, "a", "ArrowUp", 2), "a");
  });
});
