import "server-only";
import { z } from "zod";
import { ask } from "./client";
import { prompt } from "./prompts";

export type TopicVideo = { channel: string; title: string; description: string };
export type Topic = { name: string; videos: number[] };

/** Group videos into named topics. Returns video indexes per topic; a bad index or a repeat is dropped, and a topic left with under two videos is not a topic. */
export async function clusterTopics(videos: TopicVideo[]): Promise<Topic[]> {
  if (videos.length < 2) return [];
  const out = await ask(
    z.object({ topics: z.array(z.object({ name: z.string(), videos: z.array(z.number().int()) })) }),
    await prompt("topics"),
    videos.map((v, i) => `#${i} ${v.channel}: ${v.title}\n${v.description.replace(/\s+/g, " ").slice(0, 240)}`).join("\n\n"),
  );
  const taken = new Set<number>();
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
