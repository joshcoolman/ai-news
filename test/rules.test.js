import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listFresh, playable, withinDays } from "../server/rules.js";

describe("playable", () => {
  const videos = [{ videoId: "a" }, { videoId: "b", membersOnly: true }];

  it("drops members-only videos by default", () => {
    assert.deepStrictEqual(playable(videos, {}), [{ videoId: "a" }]);
  });

  it("keeps them when the setting is off", () => {
    assert.strictEqual(playable(videos, { skipMembersOnly: false }).length, 2);
  });
});

describe("withinDays", () => {
  const now = Date.UTC(2026, 9, 16, 12);
  it("is inclusive of the boundary", () => {
    assert.strictEqual(withinDays(new Date(now - 7 * 86_400_000).toISOString(), 7, now), true);
    assert.strictEqual(withinDays(new Date(now - 7 * 86_400_000 - 1).toISOString(), 7, now), false);
  });
});

describe("listFresh", () => {
  const now = Date.UTC(2026, 9, 16, 12);
  const hoursAgo = (/** @type {number} */ h) => new Date(now - h * 3_600_000).toISOString();

  it("is fresh inside the window and stale at it, so a list is read at most twice a day", () => {
    assert.strictEqual(listFresh(hoursAgo(11.9), 12, now), true);
    assert.strictEqual(listFresh(hoursAgo(12), 12, now), false);
  });

  it("is stale when the list was never read", () => {
    assert.strictEqual(listFresh(undefined, 12, now), false);
  });
});
