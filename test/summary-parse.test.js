import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSummary, transcriptText } from "../server/summary-parse.js";

/** @type {Paragraph[]} */
const paragraphs = [
  { start: 0, title: "Intro", text: "Hello there." },
  { start: 42.6, text: "The main point." },
  { start: 95, title: "Wrap up", text: "Goodbye." },
];

describe("transcriptText", () => {
  it("leads each paragraph with its start in seconds and heads chapters", () => {
    assert.equal(transcriptText(paragraphs), "## Intro\n[0] Hello there.\n[42] The main point.\n## Wrap up\n[95] Goodbye.");
  });
});

describe("parseSummary", () => {
  it("reads a fenced reply and snaps each start to the nearest paragraph", () => {
    const reply = '```json\n{ "gist": " A talk. ", "points": [{ "start": 40, "text": "Main point" }, { "start": 200, "text": " End " }] }\n```';
    assert.deepStrictEqual(parseSummary(reply, paragraphs), {
      gist: "A talk.",
      points: [
        { start: 42.6, text: "Main point" },
        { start: 95, text: "End" },
      ],
    });
  });

  it("drops malformed points and keeps at most seven", () => {
    const points = [{ start: "x", text: "bad" }, { start: 1 }, ...Array.from({ length: 9 }, (_, i) => ({ start: 0, text: `p${i}` }))];
    const out = parseSummary(JSON.stringify({ gist: "g", points }), paragraphs);
    assert.deepStrictEqual(
      out.points.map((p) => p.text),
      ["p0", "p1", "p2", "p3", "p4", "p5", "p6"],
    );
  });

  it("throws rather than store junk", () => {
    assert.throws(() => parseSummary("Sorry, I can't.", paragraphs));
    assert.throws(() => parseSummary('{ "points": [{ "start": 0, "text": "a" }] }', paragraphs));
    assert.throws(() => parseSummary('{ "gist": "g", "points": [] }', paragraphs));
  });
});
