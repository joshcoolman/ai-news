import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { apply, optimistic, tiles } from "../browser/feed/live.js";

/** @typedef {import("../browser/feed/live.js").Live} Live */

/** @returns {Card} */
const card = (/** @type {string} */ id) => ({ id, kind: "story", title: id, link: "", meta: "", isNew: true });
const creators = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];
const plan = { lanes: 3, slots: 1 };
/** @type {RefreshEvent[]} */
const log = [
  { type: "start", batch: 3, startedAt: new Date(0).toISOString(), creators },
  { type: "creator-done", creatorId: "a" },
  { type: "creator-failed", creatorId: "b" },
  { type: "lanes", lanes: [{ id: "n0", name: "Gemini 4 Argon" }, { id: "n1", name: "REA" }, { id: "n2", name: "Opus 6" }], slots: 1 },
  { type: "activity", laneId: "n0", text: 'Searching "Gemini 4 Argon"' },
  { type: "stories", laneId: "n1", cards: [card("s1")] },
  { type: "lane-done", laneId: "n1" },
  { type: "lane-done", laneId: "n2" },
];
const replay = (/** @type {RefreshEvent[]} */ events, from = optimistic(creators, plan)) => events.reduce(apply, from);
const shape = (/** @type {Live} */ live) => tiles(live, new Set()).map((t) => (t.kind === "card" ? t.card.id : `slot:${t.label}`));

describe("live refresh", () => {
  it("draws placeholder story slots before the names are known", () => {
    assert.deepStrictEqual(shape(optimistic(creators, plan)), Array(3).fill("slot:Finding stories"));
  });

  it("names its slots, fills them as stories arrive, and drops the ones nothing filled", () => {
    // Argon still searching: a slot with its activity. REA found its story. Opus 6 ended with nothing: slot gone.
    const live = replay(log);
    assert.deepStrictEqual(shape(live), ["slot:Gemini 4 Argon", "s1"]);
    assert.deepStrictEqual(tiles(live, new Set())[0], { kind: "slot", key: "n0-0", label: "Gemini 4 Argon", activity: 'Searching "Gemini 4 Argon"' });
    assert.deepStrictEqual(live.creators.map((c) => c.status), ["done", "failed"]);
  });

  it("a replay after reload, from any earlier state, ends in the same place", () => {
    const halfway = replay(log.slice(0, 4));
    assert.deepStrictEqual(shape(replay(log, halfway)), shape(replay(log)));
  });

  it("drops every remaining slot when the refresh is done", () => {
    const done = apply(replay(log), { type: "done", stories: 1, failed: ["Beta"], seconds: 40, usd: 1, cancelled: true });
    assert.deepStrictEqual(shape(done), ["s1"]);
  });
});
