import "server-only";
import { z } from "zod";
import { ask } from "./client";
import { prompt } from "./prompts";
import type { SearchResult } from "../sources/youtube";

/* The two model steps of "more like this": write a query, then pick what is relevant. */

export type CardForQuery = { label: string; title: string; source: string };

/**
 * Step one: a YouTube search query for the card's topic, plus a one-to-three-word
 * name for the thing (used when the card has no label).
 */
export async function writeQuery(card: CardForQuery): Promise<{ query: string; label: string }> {
  const out = await ask(
    z.object({ query: z.string(), label: z.string() }),
    await prompt("more-like-this-query"),
    `Label: ${card.label || "(none)"}\nTitle: ${card.title}\nSource: ${card.source}`,
  );
  return { query: out.query.trim(), label: out.label.trim() };
}

/** Step two: pick up to 4 results actually about the card's topic, preferring recent ones. */
export async function pickRelevant(card: CardForQuery, results: SearchResult[]): Promise<number[]> {
  if (!results.length) return [];
  const out = await ask(
    z.object({ picks: z.array(z.number().int()).max(4) }),
    await prompt("more-like-this-pick"),
    `Card: [${card.label}] ${card.title} (${card.source})\n\nResults:\n` +
      results.map((r, i) => `#${i} ${r.title} - ${r.channel}${r.ageText ? `, ${r.ageText}` : ""}`).join("\n"),
  );
  return [...new Set(out.picks)].filter((i) => i >= 0 && i < results.length).slice(0, 4);
}
