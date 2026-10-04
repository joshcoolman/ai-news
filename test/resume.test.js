import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resumePoint } from "../browser/player/resume.js";

describe("resumePoint", () => {
  it("keeps a position in the middle, in whole seconds", () => {
    assert.strictEqual(resumePoint(312.7, 900), 312);
  });

  it("starts over when barely begun", () => {
    assert.strictEqual(resumePoint(3, 900), undefined);
  });

  it("starts over when as good as finished", () => {
    assert.strictEqual(resumePoint(895, 900), undefined);
  });

  it("keeps the position while the duration is still unknown", () => {
    assert.strictEqual(resumePoint(312, 0), 312);
  });
});
