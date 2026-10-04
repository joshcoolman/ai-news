import { createHash } from "node:crypto";
import { clusterTopics } from "../ai/topics.js";
import { prompt } from "../ai/prompts.js";
import { videoItemId } from "../refresh/save.js";
import { recentEntries } from "./recent.js";

/*
  One model call per set of videos: the result is cached on the sorted video
  ids and the prompt, so it is only redone when a new video appears (or one ages out). The
  model sees the whole 28 days; the page narrows it to the chosen window.
*/
/** @type {Map<string, Promise<PageTopic[]>>} */
const cache = new Map();

/** @param {Creator[]} creators */
export async function topicsFor(creators) {
  const { entries } = await recentEntries(creators);
  // The prompt is part of the key, so editing it regroups on the next visit.
  const key = createHash("sha1").update((await prompt("topics")) + entries.map((e) => e.video.videoId).sort().join(",")).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;
  const run = clusterTopics(entries.map((e) => ({ channel: e.c.name, title: e.video.title, description: e.video.description }))).then((topics) =>
    topics.map((t) => ({ name: t.name, ids: t.videos.map((i) => videoItemId(entries[i].video.videoId)) })),
  );
  cache.clear();
  cache.set(key, run);
  run.catch(() => cache.delete(key));
  return run;
}
