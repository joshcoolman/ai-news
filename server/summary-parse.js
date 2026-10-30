/*
  The summary's pure parts (#108): the prompt with the reader's guidance (#110),
  the transcript as the model reads it, and the model's reply as the app
  stores it. Pure and tested (rule 3): a reply that does not parse throws, so
  nothing malformed is ever stored.
*/

const MIN_POINTS = 1;
/** Room for guidance that asks for a list ("every company mentioned"); the default asks for 3 to 7. */
const MAX_POINTS = 20;
/** Guidance past this is cut: it is a note, not a second prompt. */
export const MAX_GUIDANCE = 1000;

const PROMPT = `Below is the transcript of a YouTube video, one paragraph a line, each led by its start in seconds in square brackets; "##" lines are chapter titles.

Summarize what a viewer should take away from it: the salient points, claims, numbers, recommendations and conclusions, not a play-by-play. Skip sponsor reads, greetings and calls to subscribe.

Answer with JSON only, no other words:
{"gist": "<one sentence: what the video is about>", "points": [{"start": <seconds of the paragraph where the point is made>, "text": "<one takeaway, one or two plain sentences>"}]}

Give 3 to 7 points, in the order the video makes them.`;

/**
 * The instructions the model gets, with the reader's guidance (#110) when there is
 * some: it wins over the defaults on what to pick and how to word it, never on the
 * JSON shape, which the app reads.
 * @param {string} guidance
 */
export function summaryPrompt(guidance) {
  const said = guidance.trim().slice(0, MAX_GUIDANCE);
  if (!said) return PROMPT;
  return `${PROMPT}

The reader asked for this; follow it over the defaults above on what to include, how many points and how to word them (a point can be a name with a short note), but keep the JSON shape, a gist and a start on every point (where it is first mentioned):
<guidance>
${said}
</guidance>`;
}

/**
 * The transcript as the model reads it: one paragraph a line, each led by its
 * start in whole seconds, a chapter's title above its first paragraph.
 * @param {Paragraph[]} paragraphs
 */
export function transcriptText(paragraphs) {
  return paragraphs.map((p) => `${p.title ? `## ${p.title}\n` : ""}[${Math.floor(p.start)}] ${p.text}`).join("\n");
}

/**
 * The model's reply as stored: `{ gist, points }`, each point's start snapped to
 * the paragraph that starts nearest it, so every timestamp seeks somewhere real.
 * The reply is JSON, possibly fenced or with words around it.
 * @param {string} reply
 * @param {Paragraph[]} paragraphs
 * @returns {{ gist: string, points: SummaryPoint[] }}
 */
export function parseSummary(reply, paragraphs) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  if (from < 0 || to < from) throw new Error("summary reply has no JSON object");
  /** @type {any} */
  const raw = JSON.parse(reply.slice(from, to + 1));
  const gist = typeof raw?.gist === "string" ? raw.gist.trim() : "";
  if (!gist) throw new Error("summary reply has no gist");
  if (!Array.isArray(raw.points)) throw new Error("summary reply has no points");
  const starts = paragraphs.map((p) => p.start);
  const points = raw.points
    .filter((/** @type {any} */ p) => typeof p?.text === "string" && p.text.trim() && Number.isFinite(p.start))
    .slice(0, MAX_POINTS)
    .map((/** @type {{ start: number, text: string }} */ p) => ({ start: nearest(starts, p.start), text: p.text.trim() }));
  if (points.length < MIN_POINTS) throw new Error("summary reply has no usable points");
  return { gist, points };
}

/**
 * @param {number[]} starts
 * @param {number} at
 */
function nearest(starts, at) {
  if (!starts.length) return 0;
  return starts.reduce((best, s) => (Math.abs(s - at) < Math.abs(best - at) ? s : best));
}
