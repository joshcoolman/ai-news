import "server-only";
import { createHash } from "node:crypto";
import { mutate, read } from "../store";
import type { HiddenBy, Item, StoryItem, VideoItem } from "../store/types";
import { domainOf, mergeBatch, normalizeUrl, withinDays } from "../feed/rules";
import { channelInfo, videoDuration, type FeedVideo } from "../sources/youtube";

/*
  Turning fetched videos and found stories into stored items, plus the
  background fill-ins (durations, avatars). Shared by a refresh and by
  "more like this". Every write goes through store.mutate.
*/

/** Save one creator's videos (and its feed position). Returns what was actually added. */
export async function saveVideos(
  batch: number,
  channelId: string,
  newestSeen: string | undefined,
  entries: { video: FeedVideo; hiddenBy?: HiddenBy }[],
): Promise<VideoItem[]> {
  const now = new Date().toISOString();
  const incoming = entries.map(({ video, hiddenBy }) => ({ ...videoItem(video, now), ...(hiddenBy ? { hiddenBy } : {}) }));
  const added = (await mutate((d) => {
    const c = d.creators.find((x) => x.channelId === channelId);
    if (c && newestSeen && (!c.newestSeen || newestSeen > c.newestSeen)) c.newestSeen = newestSeen;
    return mergeBatch(d.items, incoming, batch);
  })) as VideoItem[];
  void fillDurations(added);
  return added;
}

/** Save one lane's stories, skipping any that duplicate a stored card or another lane's. */
export async function saveStories(batch: number, stories: { label: string; title: string; sourceUrl: string; topic: string }[]) {
  const now = new Date().toISOString();
  return (await mutate((d) => {
    const links = new Set(d.items.map((i) => normalizeUrl(i.link)));
    const labels = new Set(
      d.items.filter((i): i is StoryItem => i.kind === "story" && withinDays(i.createdAt, 30)).map((i) => i.label.toLowerCase()),
    );
    const incoming: StoryItem[] = [];
    for (const s of stories) {
      const url = normalizeUrl(s.sourceUrl);
      if (links.has(url) || labels.has(s.label.toLowerCase())) {
        console.log(`[stories] skipped duplicate "${s.label}"`);
        continue;
      }
      links.add(url);
      labels.add(s.label.toLowerCase());
      incoming.push({
        id: `s-${createHash("sha1").update(url).digest("hex").slice(0, 12)}`,
        kind: "story",
        createdAt: now,
        title: s.title,
        link: s.sourceUrl,
        label: s.label,
        topic: s.topic,
        sourceDomain: domainOf(s.sourceUrl),
      });
    }
    return mergeBatch(d.items, incoming, batch);
  })) as StoryItem[];
}

export function videoItemId(videoId: string): string {
  return `v-${videoId}`;
}

export function videoItem(
  v: { videoId: string; title: string; channel: string; publishedAt?: string; duration?: number },
  createdAt: string,
): VideoItem {
  return {
    id: videoItemId(v.videoId),
    kind: "video",
    createdAt,
    title: v.title,
    link: `https://www.youtube.com/watch?v=${v.videoId}`,
    videoId: v.videoId,
    channel: v.channel,
    publishedAt: v.publishedAt ?? createdAt,
    ...(v.duration ? { duration: v.duration } : {}),
  };
}

/** A channel's video list carries no durations. Fill them in afterwards (feed or Favorites); never block a refresh on it. */
export async function fillDurations(items: Item[]) {
  const todo = items.filter((i): i is VideoItem => i.kind === "video" && !i.duration);
  for (let n = 0; n < todo.length; n += 4) {
    const chunk = todo.slice(n, n + 4);
    const found = await Promise.all(chunk.map((v) => videoDuration(v.videoId)));
    await mutate((d) => {
      const all = [...d.items, ...d.favorites.map((f) => f.item)];
      chunk.forEach((v, k) => {
        for (const item of all) if (item.id === v.id && item.kind === "video" && found[k]) item.duration = found[k];
      });
    });
  }
}

export async function fillAvatars() {
  const { creators } = await read();
  for (const c of creators.filter((c) => !c.avatarUrl)) {
    try {
      const info = await channelInfo(c.channelId);
      await mutate((d) => {
        const target = d.creators.find((x) => x.channelId === c.channelId);
        if (target && !target.avatarUrl) target.avatarUrl = info.avatarUrl;
      });
    } catch (err) {
      console.log(`[refresh] avatar for ${c.name} failed: ${(err as Error).message}`);
    }
  }
}
