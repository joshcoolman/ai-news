import { mutate, read } from "./store.js";
import { MAX_GUIDANCE, parseSummary, summaryPrompt, transcriptText } from "./summary-parse.js";

/*
  A stored transcript's summary (#108): what to take away from the video, made
  only when the reader asks (Summarize or Resummarize in the Transcript's
  panel), with their guidance (#110); a new one replaces the old. One request to the Claude API, plain fetch, no SDK. The key is the
  server's own, ANTHROPIC_API_KEY in .env.local: never from the browser, never
  logged. ANTHROPIC_MODEL picks another model.
*/

const API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-5-5";

/** Why there is no summary, worded for the panel: no key, or no transcript to read. */
export class SummaryUnavailable extends Error {}

/** @type {Map<string, Promise<Summary>>} One request a video, however many times Summarize is pressed while it runs. */
const running = new Map();

/**
 * The stored summary, if one was made, and the guidance used last, to pre-fill the box. Never asks anyone.
 * @param {string} videoId
 */
export async function storedSummary(videoId) {
  const d = await read();
  return { summary: d.summaries[videoId], guidance: d.settings.summaryGuidance ?? "" };
}

/**
 * Make the summary now with this guidance, replacing any stored one, and remember the guidance for the next.
 * @param {string} videoId
 * @param {string} guidance
 * @returns {Promise<Summary>}
 */
export async function summarize(videoId, guidance) {
  const said = guidance.trim().slice(0, MAX_GUIDANCE);
  await mutate((d) => {
    if (said) d.settings.summaryGuidance = said;
    else delete d.settings.summaryGuidance;
  });
  const pending = running.get(videoId) ?? make(videoId, said).finally(() => running.delete(videoId));
  running.set(videoId, pending);
  return pending;
}

/**
 * @param {string} videoId
 * @param {string} guidance
 */
async function make(videoId, guidance) {
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
      max_tokens: 4000,
      messages: [{ role: "user", content: `${summaryPrompt(guidance)}\n\n<transcript>\n${transcriptText(paragraphs)}\n</transcript>` }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  /** @type {any} */
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} from the Claude API: ${d?.error?.message ?? "no message"}`);
  const text = (d.content ?? []).filter((/** @type {any} */ b) => b.type === "text").map((/** @type {any} */ b) => b.text).join("");
  const made = { madeAt: new Date().toISOString(), model, ...(guidance && { guidance }), ...parseSummary(text, paragraphs) };
  await mutate((data) => void (data.summaries[videoId] = made));
  console.log(`[summary] ${videoId}: ${made.points.length} points (${model}, ${d.usage?.input_tokens ?? "?"} in, ${d.usage?.output_tokens ?? "?"} out)`);
  return made;
}
