import { arr, ask, int, obj, str } from "./client.js";
import { prompt } from "./prompts.js";

/* The two model steps of "more like this": write a query, then pick what is relevant. */

/** @typedef {{ label: string, title: string, source: string }} CardForQuery */

/**
 * Step one: a YouTube search query for the card's topic, plus a one-to-three-word
 * name for the thing (used when the card has no label).
 * @param {CardForQuery} card
 */
export async function writeQuery(card) {
  /** @type {{ query: string, label: string }} */
  const out = await ask(
    obj({ query: str(), label: str() }),
    await prompt("more-like-this-query"),
    `Label: ${card.label || "(none)"}\nTitle: ${card.title}\nSource: ${card.source}`,
  );
  return { query: out.query.trim(), label: out.label.trim() };
}

/**
 * Step two: pick up to 4 results actually about the card's topic, preferring recent ones.
 * @param {CardForQuery} card
 * @param {SearchResult[]} results
 * @returns {Promise<number[]>}
 */
export async function pickRelevant(card, results) {
  if (!results.length) return [];
  /** @type {{ picks: number[] }} */
  const out = await ask(
    obj({ picks: { ...arr(int), description: "At most 4." } }),
    await prompt("more-like-this-pick"),
    `Card: [${card.label}] ${card.title} (${card.source})\n\nResults:\n` +
      results.map((r, i) => `#${i} ${r.title} - ${r.channel}${r.ageText ? `, ${r.ageText}` : ""}`).join("\n"),
  );
  return [...new Set(out.picks)].filter((i) => i >= 0 && i < results.length).slice(0, 4);
}
