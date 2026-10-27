import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paragraphs, parseTimedText } from "../server/transcript-parse.js";

describe("parseTimedText", () => {
  it("reads start, duration and decoded text from each caption, dropping sound cues", () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?><transcript><text start="0" dur="3.28">PonyTail is one of</text><text start="1.72" dur="4">it&amp;#39;s &quot;here&quot;\n now</text><text start="5" dur="1">[Music]</text><text start="6">no dur</text></transcript>`;
    assert.deepStrictEqual(parseTimedText(xml), [
      { start: 0, dur: 3.28, text: "PonyTail is one of" },
      { start: 1.72, dur: 4, text: "it's \"here\" now" },
      { start: 6, dur: 0, text: "no dur" },
    ]);
  });
});

/** @param {number} n Fragments of 4 seconds each, back to back, from 0. */
const run = (n, text = "words") => Array.from({ length: n }, (_, i) => ({ start: i * 4, dur: 4, text: `${text}${i}` }));

describe("paragraphs", () => {
  it("breaks unpunctuated captions at a fragment once 40 seconds have run", () => {
    const out = paragraphs(run(25));
    assert.deepStrictEqual(
      out.map((p) => [p.start, p.text.split(" ").length]),
      [
        [0, 10],
        [40, 10],
        [80, 5],
      ],
    );
  });

  it("waits for a sentence end when the captions are punctuated", () => {
    const frags = run(15).map((f, i) => ({ ...f, text: i === 11 ? "end." : f.text }));
    const out = paragraphs(frags);
    assert.deepStrictEqual(
      out.map((p) => p.start),
      [0, 48],
    );
  });

  it("breaks at a pause of more than two seconds", () => {
    const frags = [
      { start: 0, dur: 2, text: "a" },
      { start: 2, dur: 2, text: "b" },
      { start: 7, dur: 2, text: "c" },
    ];
    assert.deepStrictEqual(paragraphs(frags), [
      { start: 0, text: "a b" },
      { start: 7, text: "c" },
    ]);
  });

  it("starts a headed paragraph at each chapter", () => {
    const chapters = [
      { start: 0, title: "Intro" },
      { start: 8, title: "Middle" },
      { start: 16, title: "End" },
    ];
    assert.deepStrictEqual(paragraphs(run(5), chapters), [
      { start: 0, title: "Intro", text: "words0 words1" },
      { start: 8, title: "Middle", text: "words2 words3" },
      { start: 16, title: "End", text: "words4" },
    ]);
  });

  it("lets a sentence finish before a chapter heads the next paragraph", () => {
    const frags = [
      { start: 0, dur: 4, text: "Nearly there," },
      { start: 4, dur: 4, text: "the end." },
      { start: 8, dur: 4, text: "New topic." },
    ];
    const chapters = [
      { start: 0, title: "A" },
      { start: 3, title: "B" },
      { start: 100, title: "C" },
    ];
    assert.deepStrictEqual(paragraphs(frags, chapters), [
      { start: 0, title: "A", text: "Nearly there, the end." },
      { start: 8, title: "B", text: "New topic." },
    ]);
  });

  it("heads only the first paragraph of a long chapter", () => {
    const out = paragraphs(run(25), [{ start: 0, title: "One" }, { start: 1000, title: "x" }, { start: 2000, title: "y" }]);
    assert.deepStrictEqual(
      out.map((p) => [p.start, p.title]),
      [
        [0, "One"],
        [40, undefined],
        [80, undefined],
      ],
    );
  });
});
