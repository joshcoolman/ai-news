import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, SMALL_MODEL } from "./client";
import type { AvoidEntry, HiddenBy } from "../store/types";
import type { SearchResult } from "../youtube";

/*
  The small model calls: the creator-video filter and the two "more like this" steps.
  Guidance and avoid entries are passed word for word; nothing rewrites them into rules.
*/

export async function ask<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T>> {
  const res = await anthropic().messages.parse({
    model: SMALL_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(schema) },
  });
  console.log(`[small] input=${res.usage.input_tokens} output=${res.usage.output_tokens}`);
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`small model returned ${res.stop_reason}`);
  return res.parsed_output as z.infer<T>;
}

export type FilterVideo = { title: string; description: string; channel: string; guidance: string };

// A verdict per video, reasoning first: a bare "list what to hold" held back obvious announcements.
const FilterOutput = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int(),
      reasoning: z.string().describe("One sentence: does this video fit its creator's guidance, and does it match any avoid entry?"),
      hold: z.boolean(),
      matched: z.string().describe("When hold is true: the avoid entry id (e.g. a1), or the word guidance. Otherwise empty."),
    }),
  ),
});

/**
 * Decide which new creator videos to hold back. Returns a map from video index
 * to what it matched. Callers skip this when there is no guidance and no avoid list.
 */
export async function filterVideos(videos: FilterVideo[], avoid: AvoidEntry[]): Promise<Map<number, HiddenBy>> {
  const system =
    "You screen new YouTube videos for one reader. Give a verdict for every video.\n" +
    "- Guidance restricts a creator: keep only that creator's videos that fit it, and hold back the rest. Judge from the title and description. " +
    "A creator with no guidance has every video kept unless an avoid entry applies.\n" +
    "- An avoid entry describes something the reader does not want from anyone. Hold a video back for one only when it clearly matches; when unsure, keep it.";
  const avoidIds = new Map(avoid.map((a, n) => [`a${n + 1}`, a]));
  const user = [
    "Avoid list (applies to every video):",
    avoid.length ? [...avoidIds].map(([id, a]) => `${id}: "${a.reason}"`).join("\n") : "(empty)",
    "New videos:",
    videos
      .map(
        (v, i) =>
          `#${i} ${v.channel}\nGuidance for this creator: ${v.guidance ? `"${v.guidance}"` : "(none)"}\nTitle: ${v.title}\nDescription: ${v.description.slice(0, 800)}`,
      )
      .join("\n\n"),
  ].join("\n\n");

  const out = await ask(FilterOutput, system, user);
  const held = new Map<number, HiddenBy>();
  for (const h of out.verdicts) {
    const v = videos[h.index];
    if (!v || !h.hold) continue;
    const entry = avoidIds.get(h.matched.trim());
    if (entry) held.set(h.index, { kind: "avoid", avoidId: entry.id, text: entry.reason });
    else if (v.guidance) held.set(h.index, { kind: "guidance", text: v.guidance });
  }
  return held;
}

export type CardForQuery = { label: string; title: string; source: string };

/**
 * Step one of "more like this": a YouTube search query for the card's topic,
 * plus a one-to-three-word name for the thing (used when the card has no label).
 */
export async function writeQuery(card: CardForQuery): Promise<{ query: string; label: string }> {
  const out = await ask(
    z.object({ query: z.string(), label: z.string() }),
    "Write one YouTube search query (2 to 6 words) that finds videos about the specific thing this card is about. " +
      "Name the thing itself; no generic words like 'AI news'. Also give label: one to three words naming that thing, no numbers, no adjectives.",
    `Label: ${card.label || "(none)"}\nTitle: ${card.title}\nSource: ${card.source}`,
  );
  return { query: out.query.trim(), label: out.label.trim() };
}

/** Step two: pick up to 4 results actually about the card's topic, preferring recent ones. */
export async function pickRelevant(card: CardForQuery, results: SearchResult[]): Promise<number[]> {
  if (!results.length) return [];
  const out = await ask(
    z.object({ picks: z.array(z.number().int()).max(4) }),
    "Pick YouTube results that are actually about the specific thing on the card, not merely similar tools or general news. " +
      "Prefer recent ones. Pick at most 4. If only one or two are relevant, pick only those. If none are, pick none.",
    `Card: [${card.label}] ${card.title} (${card.source})\n\nResults:\n` +
      results.map((r, i) => `#${i} ${r.title} - ${r.channel}${r.ageText ? `, ${r.ageText}` : ""}`).join("\n"),
  );
  return [...new Set(out.picks)].filter((i) => i >= 0 && i < results.length).slice(0, 4);
}
