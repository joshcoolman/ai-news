import { arr, ask, int, obj, str } from "./client.js";
import { prompt } from "./prompts.js";

/**
 * Group videos into named topics. Returns video indexes per topic; a bad index or a repeat is dropped, and a topic left with under two videos is not a topic.
 * @param {{ channel: string, title: string, description: string }[]} videos
 * @returns {Promise<{ name: string, videos: number[] }[]>}
 */
export async function clusterTopics(videos) {
  if (videos.length < 2) return [];
  /** @type {{ topics: { name: string, videos: number[] }[] }} */
  const out = await ask(
    obj({ topics: arr(obj({ name: str(), videos: arr(int) })) }),
    await prompt("topics"),
    videos.map((v, i) => `#${i} ${v.channel}: ${v.title}\n${v.description.replace(/\s+/g, " ").slice(0, 240)}`).join("\n\n"),
  );
  const taken = new Set();
  return out.topics
    .map((t) => ({
      name: t.name.trim(),
      videos: [...new Set(t.videos)].filter((i) => i >= 0 && i < videos.length && !taken.has(i)),
    }))
    .filter((t) => {
      if (!t.name || t.videos.length < 2) return false;
      t.videos.forEach((i) => taken.add(i));
      return true;
    });
}
