import { createHash } from "node:crypto";
import { mutate, read } from "./store";
import type { Creator, HiddenBy, Item, StoryItem, VideoItem } from "./store/types";
import { domainOf, maxBatch, mergeBatch, normalizeUrl, withinDays } from "./feed";
import { channelInfo, listChannelVideos, videoDuration, type FeedVideo } from "./youtube";
import { filterVideos } from "./agent/small";
import { STORIES_MODEL } from "./agent/client";
import { estimateCost, planLanes, runLane, STORIES_PER_LANE, type Lane, type StoriesInput, type Usage } from "./agent/stories";
import { toCard } from "./view";
import type { RefreshEvent } from "./refresh-events";

/*
  A refresh runs as one server-side job that outlives the request that started
  it. Everything it does is appended to an event log on globalThis; the browser
  streams that log over SSE (replaying it in full on reconnect), so a reload
  never loses progress. Creator feeds, the filter and the story lanes all run in
  parallel and each result is saved and announced the moment it is ready. The
  lock is held until the job ends; a second refresh gets a 409.
*/

const FIRST_FETCH = 2;
const PER_REFRESH = 5;

type RefreshState = {
  events: RefreshEvent[];
  listeners: Set<(e: RefreshEvent) => void>;
  abort: AbortController;
};

const g = globalThis as typeof globalThis & { __refresh?: RefreshState };

export class RefreshBusyError extends Error {}

export function refreshRunning(): boolean {
  return !!g.__refresh;
}

/**
 * Follow the running refresh: `onEvent` receives every event so far, then each
 * new one. Returns an unsubscribe function, or null when nothing is running.
 */
export function subscribe(onEvent: (e: RefreshEvent) => void): (() => void) | null {
  const state = g.__refresh;
  if (!state) return null;
  state.events.forEach(onEvent);
  state.listeners.add(onEvent);
  return () => state.listeners.delete(onEvent);
}

export function cancelRefresh(): boolean {
  if (!g.__refresh) return false;
  g.__refresh.abort.abort();
  return true;
}

export function startRefresh(): void {
  if (g.__refresh) throw new RefreshBusyError("A refresh is already running.");
  const state: RefreshState = { events: [], listeners: new Set(), abort: new AbortController() };
  g.__refresh = state;
  const emit = (e: RefreshEvent) => {
    state.events.push(e);
    for (const l of state.listeners) l(e);
  };
  void run(emit, state.abort.signal).finally(() => {
    if (g.__refresh === state) g.__refresh = undefined;
  });
}

async function run(emit: (e: RefreshEvent) => void, signal: AbortSignal) {
  const started = Date.now();
  const totals = { videos: 0, stories: 0, hidden: 0, usage: { input: 0, output: 0, searches: 0, fetches: 0 } as Usage };
  const failed: string[] = [];
  const usd = () => estimateCost(STORIES_MODEL, totals.usage);
  const finish = (error?: string) =>
    emit({
      type: "done",
      videos: totals.videos,
      stories: totals.stories,
      hidden: totals.hidden,
      failed,
      seconds: Math.round((Date.now() - started) / 1000),
      usd: usd(),
      cancelled: signal.aborted,
      error,
    });

  try {
    const data = await read();
    const batch = maxBatch(data.items) + 1;
    void fillAvatars();
    emit({
      type: "start",
      batch,
      startedAt: new Date(started).toISOString(),
      creators: data.creators.map((c) => ({ id: c.channelId, name: c.name })),
    });

    const stored = new Set(data.items.map((i) => i.id));
    const creatorTitles: StoriesInput["creatorTitles"] = [];
    const toFilter: { creator: Creator; videos: FeedVideo[]; newestSeen?: string }[] = [];

    // 1. Every creator feed at once. Each resolves into cards as soon as it lands.
    await Promise.all(
      data.creators.map(async (creator) => {
        let videos: FeedVideo[];
        try {
          videos = await listChannelVideos(creator.channelId);
        } catch (err) {
          console.log(`[refresh] ${creator.name} failed: ${(err as Error).message}`);
          failed.push(creator.name);
          emit({ type: "creator-failed", creatorId: creator.channelId });
          return;
        }
        for (const v of videos) {
          if (withinDays(v.publishedAt, 7)) creatorTitles.push({ channel: creator.name, title: v.title, publishedAt: v.publishedAt });
        }
        const fresh = (
          creator.newestSeen ? videos.filter((v) => v.publishedAt > creator.newestSeen!).slice(0, PER_REFRESH) : videos.slice(0, FIRST_FETCH)
        ).filter((v) => !stored.has(videoItemId(v.videoId)));
        const newestSeen = videos[0]?.publishedAt;

        if (fresh.length && (creator.guidance.trim() || data.avoid.length)) {
          // Show them now, marked as checking; the filter decides shortly.
          toFilter.push({ creator, videos: fresh, newestSeen });
          const now = new Date().toISOString();
          emit({ type: "videos", creatorId: creator.channelId, checking: true, cards: fresh.map((v) => toCard(videoItem(v, now), undefined, true)) });
          return;
        }
        const added = await saveVideos(batch, creator.channelId, newestSeen, fresh.map((v) => ({ video: v })));
        totals.videos += added.length;
        emit({ type: "videos", creatorId: creator.channelId, checking: false, cards: added.map((i) => toCard(i, undefined, true)) });
      }),
    );

    // 2. The filter and the story lanes run side by side.
    await Promise.all([
      runFilter(batch, toFilter, data.avoid, emit, totals),
      runStories(batch, { avoid: data.avoid, creatorTitles, recentCards: recentCards(data.items) }, emit, signal, totals),
    ]);
    finish();
  } catch (err) {
    console.log(`[refresh] failed: ${(err as Error).stack ?? err}`);
    finish((err as Error).message);
  }
}

async function runFilter(
  batch: number,
  pending: { creator: Creator; videos: FeedVideo[]; newestSeen?: string }[],
  avoid: StoriesInput["avoid"],
  emit: (e: RefreshEvent) => void,
  totals: { videos: number; hidden: number },
) {
  if (!pending.length) return;
  const flat = pending.flatMap((p) => p.videos.map((video) => ({ video, creator: p.creator })));
  let held = new Map<number, HiddenBy>();
  try {
    held = await filterVideos(flat.map((f) => ({ ...f.video, guidance: f.creator.guidance.trim() })), avoid);
  } catch (err) {
    console.log(`[refresh] filter failed, letting every video through: ${(err as Error).message}`);
  }
  const heldIds: string[] = [];
  let n = 0;
  for (const p of pending) {
    const entries = p.videos.map((video) => {
      const hiddenBy = held.get(n++);
      if (hiddenBy) heldIds.push(videoItemId(video.videoId));
      return { video, hiddenBy };
    });
    const added = await saveVideos(batch, p.creator.channelId, p.newestSeen, entries);
    totals.hidden += added.filter((i) => i.hiddenBy).length;
    totals.videos += added.filter((i) => !i.hiddenBy).length;
  }
  emit({ type: "filtered", heldIds });
}

async function runStories(
  batch: number,
  input: StoriesInput,
  emit: (e: RefreshEvent) => void,
  signal: AbortSignal,
  totals: { stories: number; usage: Usage },
) {
  let lanes: Lane[];
  try {
    lanes = await planLanes(input);
  } catch (err) {
    console.log(`[stories] planning failed: ${(err as Error).message}`);
    emit({ type: "lanes", lanes: [], slots: 0 });
    return;
  }
  emit({ type: "lanes", lanes, slots: STORIES_PER_LANE });
  console.log(`[stories] lanes: ${lanes.map((l) => l.name).join(" | ")}`);

  await Promise.all(
    lanes.map(async (lane) => {
      const t0 = Date.now();
      try {
        const stories = await runLane(
          lane,
          lanes.filter((l) => l !== lane),
          input,
          {
            onActivity: (text) => emit({ type: "activity", laneId: lane.id, text }),
            onUsage: (u) => {
              const t = totals.usage;
              t.input += u.input;
              t.output += u.output;
              t.searches += u.searches;
              t.fetches += u.fetches;
              emit({ type: "cost", usd: estimateCost(STORIES_MODEL, t), searches: t.searches });
            },
          },
          signal,
        );
        const added = await saveStories(batch, stories);
        totals.stories += added.length;
        emit({ type: "stories", laneId: lane.id, cards: added.map((i) => toCard(i, undefined, true)) });
        emit({ type: "lane-done", laneId: lane.id });
        console.log(`[lane ${lane.name}] ${added.length} stories in ${Math.round((Date.now() - t0) / 1000)}s`);
      } catch (err) {
        if (signal.aborted) return emit({ type: "lane-done", laneId: lane.id, cancelled: true });
        console.log(`[lane ${lane.name}] failed: ${(err as Error).message}`);
        emit({ type: "lane-done", laneId: lane.id, error: (err as Error).message });
      }
    }),
  );
  const u = totals.usage;
  console.log(
    `[stories] model=${STORIES_MODEL} input=${u.input} output=${u.output} searches=${u.searches} fetches=${u.fetches} ~$${estimateCost(STORIES_MODEL, u).toFixed(2)}`,
  );
}

/** Save one creator's videos (and its feed position). Returns what was actually added. */
async function saveVideos(
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
async function saveStories(batch: number, stories: { label: string; title: string; sourceUrl: string; topic: string }[]) {
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

function recentCards(items: Item[]) {
  return items
    .filter((i) => withinDays(i.createdAt, 30))
    .map((i) => ({ label: i.kind === "story" ? i.label : i.moreLabel ?? "", title: i.title, link: i.link }));
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

/** Durations are not in the feed XML. Fill them in afterwards; never block a refresh on it. */
export async function fillDurations(items: Item[]) {
  const todo = items.filter((i): i is VideoItem => i.kind === "video" && !i.duration);
  for (let n = 0; n < todo.length; n += 4) {
    const chunk = todo.slice(n, n + 4);
    const found = await Promise.all(chunk.map((v) => videoDuration(v.videoId)));
    await mutate((d) => {
      chunk.forEach((v, k) => {
        const item = d.items.find((i) => i.id === v.id);
        if (item?.kind === "video" && found[k]) item.duration = found[k];
      });
    });
  }
}

async function fillAvatars() {
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
