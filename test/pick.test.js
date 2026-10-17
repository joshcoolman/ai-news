import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atRightEdge, movePick, nearestPick } from "../browser/shared/pick.js";

const ids = ["a", "b", "c", "d", "e"];

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

describe("atRightEdge", () => {
  it("is the last card of a row, or the last card", () => {
    assert.strictEqual(atRightEdge(ids, "b", 2), true);
    assert.strictEqual(atRightEdge(ids, "d", 2), true);
    assert.strictEqual(atRightEdge(ids, "e", 2), true);
    assert.strictEqual(atRightEdge(ids, "a", 2), false);
    assert.strictEqual(atRightEdge(ids, "c", 2), false);
  });
  it("is every card in a one-column grid, and nothing that is not in the grid", () => {
    assert.strictEqual(atRightEdge(ids, "a", 1), true);
    assert.strictEqual(atRightEdge(ids, "z", 2), false);
  });
});

describe("nearestPick", () => {
  // Two columns, rows 100 tall: a b / c d / e.
  const cards = ids.map((id, i) => ({ id, top: Math.floor(i / 2) * 100, bottom: Math.floor(i / 2) * 100 + 100 }));
  it("is the right-edge card of the row nearest y", () => {
    assert.strictEqual(nearestPick(40, cards, 2), "b");
    assert.strictEqual(nearestPick(160, cards, 2), "d");
    assert.strictEqual(nearestPick(900, cards, 2), "e");
  });
  it("is the last card when it ends a short row, and nothing in an empty grid", () => {
    assert.strictEqual(nearestPick(250, cards, 2), "e");
    assert.strictEqual(nearestPick(0, [], 2), undefined);
  });
});
