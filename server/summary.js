import { mutate, read } from "./store.js";
import { parseSummary, transcriptText } from "./summary-parse.js";

/*
  A stored transcript's summary (#108): what to take away from the video, made
  only when the reader asks (S, with the Transcript open) and at most once a
  video. One request to the Claude API, plain fetch, no SDK. The key is the
  server's own, ANTHROPIC_API_KEY in .env.local: never from the browser, never
  logged. ANTHROPIC_MODEL picks another model.
*/

const API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-5-5";

const PROMPT = `Below is the transcript of a YouTube video, one paragraph a line, each led by its start in seconds in square brackets; "##" lines are chapter titles.

Summarize what a viewer should take away from it: the salient points, claims, numbers, recommendations and conclusions, not a play-by-play. Skip sponsor reads, greetings and calls to subscribe.

Answer with JSON only, no other words:
{"gist": "<one sentence: what the video is about>", "points": [{"start": <seconds of the paragraph where the point is made>, "text": "<one takeaway, one or two plain sentences>"}]}

Give 3 to 7 points, in the order the video makes them.`;

/** Why there is no summary, worded for the panel: no key, or no transcript to read. */
export class SummaryUnavailable extends Error {}

/** @type {Map<string, Promise<Summary>>} One request a video, however many times S is pressed while it runs. */
const running = new Map();

/**
 * The stored summary, or one made now from the stored transcript and stored.
 * @param {string} videoId
 * @returns {Promise<Summary>}
 */
export async function summary(videoId) {
  const known = (await read()).summaries[videoId];
  if (known) return known;
  const pending = running.get(videoId) ?? make(videoId).finally(() => running.delete(videoId));
  running.set(videoId, pending);
  return pending;
}

/** @param {string} videoId */
async function make(videoId) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new SummaryUnavailable("No Anthropic key: set ANTHROPIC_API_KEY in .env.local and restart the server.");
  const paragraphs = (await read()).transcripts[videoId]?.paragraphs;
  if (!paragraphs?.length) throw new SummaryUnavailable("No transcript stored for this video.");
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content: `${PROMPT}\n\n<transcript>\n${transcriptText(paragraphs)}\n</transcript>` }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  /** @type {any} */
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} from the Claude API: ${d?.error?.message ?? "no message"}`);
  const text = (d.content ?? []).filter((/** @type {any} */ b) => b.type === "text").map((/** @type {any} */ b) => b.text).join("");
  const made = { madeAt: new Date().toISOString(), model, ...parseSummary(text, paragraphs) };
  await mutate((data) => void (data.summaries[videoId] = made));
  console.log(`[summary] ${videoId}: ${made.points.length} points (${model}, ${d.usage?.input_tokens ?? "?"} in, ${d.usage?.output_tokens ?? "?"} out)`);
  return made;
}
