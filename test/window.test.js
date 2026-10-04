import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampDays, DEFAULT_DAYS, MAX_DAYS, MIN_DAYS } from "../server/creators/window.js";

describe("clampDays", () => {
  it("keeps the Creators window between its floor and ceiling", () => {
    assert.strictEqual(clampDays(1), MIN_DAYS);
    assert.strictEqual(clampDays(99), MAX_DAYS);
    assert.strictEqual(clampDays(12.4), 12);
  });

  it("falls back to the default for anything that is not a number", () => {
    assert.strictEqual(clampDays(undefined), DEFAULT_DAYS);
    assert.strictEqual(clampDays("soon"), DEFAULT_DAYS);
  });
});
