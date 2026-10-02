import "server-only";
import { z } from "zod";
import { ask } from "./client";
import { prompt } from "./prompts";
import type { AvoidEntry, HiddenBy } from "../store/types";

/*
  The creator-video filter. Guidance and avoid entries are passed word for
  word; nothing rewrites them into rules.
*/

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

  const out = await ask(FilterOutput, await prompt("filter-videos"), user);
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
