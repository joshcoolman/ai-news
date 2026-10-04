import { arr, ask, bool, int, obj, str } from "./client.js";
import { prompt } from "./prompts.js";

/*
  The creator-video filter. Guidance is passed word for word; nothing rewrites
  it into rules.
*/

// A verdict per video, reasoning first: a bare "list what to hold" held back obvious announcements.
const FilterOutput = obj({
  verdicts: arr(obj({ index: int, reasoning: str("One sentence: does this video fit its creator's guidance?"), hold: bool })),
});

/**
 * Decide which new creator videos to hold back. Returns a map from video index
 * to the guidance it missed. Callers skip this when no creator has guidance.
 * @param {{ title: string, description: string, channel: string, guidance: string }[]} videos
 * @returns {Promise<Map<number, HiddenBy>>}
 */
export async function filterVideos(videos) {
  const user = [
    "New videos:",
    videos
      .map(
        (v, i) =>
          `#${i} ${v.channel}\nGuidance for this creator: ${v.guidance ? `"${v.guidance}"` : "(none)"}\nTitle: ${v.title}\nDescription: ${v.description.slice(0, 800)}`,
      )
      .join("\n\n"),
  ].join("\n\n");

  /** @type {{ verdicts: { index: number, reasoning: string, hold: boolean }[] }} */
  const out = await ask(FilterOutput, await prompt("filter-videos"), user);
  /** @type {Map<number, HiddenBy>} */
  const held = new Map();
  for (const h of out.verdicts) {
    const v = videos[h.index];
    if (v?.guidance && h.hold) held.set(h.index, { kind: "guidance", text: v.guidance });
  }
  return held;
}
