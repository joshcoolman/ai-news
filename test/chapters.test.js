import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chapterTarget } from "../browser/player/chapters.js";
import { parseChapters } from "../server/youtube-parse.js";

describe("parseChapters", () => {
  it("reads the timestamps a creator lists in the description", () => {
    const text = "Great video.\n\n0:00 Intro\n1:30 - The setup\n(12:05) Results\n1:02:03 Wrap up\n\nLinks: https://x.com";
    assert.deepStrictEqual(parseChapters(text), [
      { start: 0, title: "Intro" },
      { start: 90, title: "The setup" },
      { start: 725, title: "Results" },
      { start: 3723, title: "Wrap up" },
    ]);
  });

  it("is empty unless the list starts at 0:00, has three entries and only goes forward: YouTube's own rule", () => {
    assert.deepStrictEqual(parseChapters("1:00 Late start\n2:00 b\n3:00 c"), []);
    assert.deepStrictEqual(parseChapters("0:00 a\n2:00 b"), []);
    assert.deepStrictEqual(parseChapters("0:00 a\n5:00 b\n3:00 c"), []);
    assert.deepStrictEqual(parseChapters("Watch at 3:00 for the good part"), []);
  });
});

describe("chapterTarget", () => {
  const starts = [0, 90, 725];

  it("forward goes to the next chapter, and nowhere from the last", () => {
    assert.strictEqual(chapterTarget(starts, 10, 1), 90);
    assert.strictEqual(chapterTarget(starts, 90, 1), 725);
    assert.strictEqual(chapterTarget(starts, 800, 1), undefined);
  });

  it("back restarts the chapter playing, or goes to the one before when it has just begun", () => {
    assert.strictEqual(chapterTarget(starts, 200, -1), 90);
    assert.strictEqual(chapterTarget(starts, 91, -1), 0);
    assert.strictEqual(chapterTarget(starts, 1, -1), 0);
  });
});
