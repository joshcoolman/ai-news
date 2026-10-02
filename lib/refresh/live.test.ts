import { describe, expect, it } from "vitest";
import type { Card } from "../feed/cards";
import type { RefreshEvent } from "./events";
import { apply, optimistic, tiles, type Live } from "./live";

const card = (id: string): Card => ({ id, kind: "video", title: id, link: "", meta: "", isNew: true });
const creators = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];
const log: RefreshEvent[] = [
  { type: "start", batch: 3, startedAt: new Date(0).toISOString(), creators },
  { type: "videos", creatorId: "a", cards: [card("v1"), card("v2")], checking: true },
  { type: "creator-failed", creatorId: "b" },
  { type: "lanes", lanes: [{ id: "l0", name: "Coding agents", brief: "" }, { id: "l1", name: "Open models", brief: "" }], slots: 2 },
  { type: "activity", laneId: "l0", text: 'Searching "x"' },
  { type: "filtered", heldIds: ["v2"] },
  { type: "stories", laneId: "l1", cards: [card("s1")] },
  { type: "lane-done", laneId: "l1" },
];
const replay = (events: RefreshEvent[], from: Live = optimistic(creators)) => events.reduce(apply, from);
const shape = (live: Live) => tiles(live, new Set()).map((t) => (t.kind === "card" ? t.card.id : `slot:${t.label}`));

describe("live refresh", () => {
  it("draws a slot per creator and placeholder story slots before the server answers", () => {
    expect(shape(optimistic(creators))).toEqual(["slot:Alpha", "slot:Beta", ...Array(8).fill("slot:Finding stories")]);
  });

  it("fills slots as events arrive and removes the ones nothing filled", () => {
    // Alpha: v2 held back. Beta failed: slot gone. Lane l1 found one story and finished: its spare slot gone.
    expect(shape(replay(log))).toEqual(["v1", "slot:Coding agents", "slot:Coding agents", "s1"]);
  });

  it("a replay after reload, from any earlier state, ends in the same place", () => {
    const halfway = replay(log.slice(0, 4));
    expect(shape(replay(log, halfway))).toEqual(shape(replay(log)));
  });

  it("drops every remaining slot when the refresh is done", () => {
    const done = apply(replay(log), { type: "done", videos: 1, stories: 1, hidden: 1, failed: ["Beta"], seconds: 40, usd: 1, cancelled: true });
    expect(shape(done)).toEqual(["v1", "s1"]);
  });
});
