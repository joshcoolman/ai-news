/*
  The summary's two pure halves (#108): the transcript as the model reads it,
  and the model's reply as the app stores it. Pure and tested (rule 3): a reply
  that does not parse throws, so nothing malformed is ever stored.
*/

const MIN_POINTS = 1;
const MAX_POINTS = 7;

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
