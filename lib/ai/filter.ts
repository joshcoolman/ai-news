import "server-only";
import { z } from "zod";
import { ask } from "./client";
import { prompt } from "./prompts";
import type { HiddenBy } from "../store/types";

/*
  The creator-video filter. Guidance is passed word for word; nothing rewrites
  it into rules.
*/

export type FilterVideo = { title: string; description: string; channel: string; guidance: string };

// A verdict per video, reasoning first: a bare "list what to hold" held back obvious announcements.
const FilterOutput = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int(),
      reasoning: z.string().describe("One sentence: does this video fit its creator's guidance?"),
      hold: z.boolean(),
    }),
  ),
});

/**
 * Decide which new creator videos to hold back. Returns a map from video index
 * to the guidance it missed. Callers skip this when no creator has guidance.
 */
export async function filterVideos(videos: FilterVideo[]): Promise<Map<number, HiddenBy>> {
  const user = [
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
    if (v?.guidance && h.hold) held.set(h.index, { kind: "guidance", text: v.guidance });
  }
  return held;
}
