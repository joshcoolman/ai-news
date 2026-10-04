import { read } from "../store.js";
import { maxBatch, playable, withinDays } from "../feed/rules.js";
import { toCard } from "../feed/cards.js";
import { listChannelVideos } from "../youtube.js";
import { estimateCost, STORIES_MODEL, uncachedCost } from "../ai/client.js";
import { filterVideos } from "../ai/filter.js";
import { planLanes, runLane } from "../ai/stories.js";
import { STORIES_PER_LANE } from "./events.js";
import { fillAvatars, saveStories, saveVideos, videoItem, videoItemId } from "./save.js";

/*
  A refresh runs as one server-side job that outlives the request that started
  it. Everything it does is appended to an event log; the browser streams that
  log over SSE (replaying it in full on reconnect), so a reload never loses
  progress. Creator lists, the filter and the story lanes all run in parallel
  and each result is saved and announced the moment it is ready. The lock is
  held until the job ends; a second refresh gets a 409.
*/

const FIRST_FETCH = 2;
const PER_REFRESH = 5;

/** @typedef {(e: RefreshEvent) => void} Emit */
/** @typedef {{ creator: Creator, videos: FeedVideo[], newestSeen?: string }} Pending */
/** @typedef {{ videos: number, stories: number, usage: Usage }} Totals */

/** The refresh in progress, if any. */
/** @type {{ events: RefreshEvent[], listeners: Set<Emit>, abort: AbortController } | undefined} */
let running;

export class RefreshBusyError extends Error {}

export function refreshRunning() {
  return !!running;
}

/**
 * Follow the running refresh: `onEvent` receives every event so far, then each
 * new one. Returns an unsubscribe function, or null when nothing is running.
 * @param {Emit} onEvent
 */
export function subscribe(onEvent) {
  const state = running;
  if (!state) return null;
  state.events.forEach(onEvent);
  state.listeners.add(onEvent);
  return () => void state.listeners.delete(onEvent);
}

export function cancelRefresh() {
  if (!running) return false;
  running.abort.abort();
  return true;
}

export function startRefresh() {
  if (running) throw new RefreshBusyError("A refresh is already running.");
  const state = { events: /** @type {RefreshEvent[]} */ ([]), listeners: /** @type {Set<Emit>} */ (new Set()), abort: new AbortController() };
  running = state;
  /** @type {Emit} */
  const emit = (e) => {
    state.events.push(e);
    for (const l of state.listeners) l(e);
  };
  void run(emit, state.abort.signal).finally(() => {
    if (running === state) running = undefined;
  });
}

/**
 * @param {Emit} emit
 * @param {AbortSignal} signal
 */
async function run(emit, signal) {
  const started = Date.now();
  /** @type {Totals} */
  const totals = { videos: 0, stories: 0, usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, searches: 0, fetches: 0 } };
  /** @type {string[]} */
  const failed = [];
  const finish = (/** @type {string} */ error) =>
    emit({
      type: "done",
      videos: totals.videos,
      stories: totals.stories,
      failed,
      seconds: Math.round((Date.now() - started) / 1000),
      usd: estimateCost(STORIES_MODEL, totals.usage),
      cancelled: signal.aborted,
      ...(error && { error }),
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
    /** @type {StoriesInput["creatorTitles"]} */
    const creatorTitles = [];
    /** @type {Pending[]} */
    const toFilter = [];

    // 1. Every creator's list at once. Each resolves into cards as soon as it lands.
    await Promise.all(
      data.creators.map(async (creator) => {
        /** @type {FeedVideo[]} */
        let videos;
        try {
          videos = playable(await listChannelVideos(creator.channelId), data.settings);
        } catch (err) {
          console.log(`[refresh] ${creator.name} failed: ${/** @type {Error} */ (err).message}`);
          failed.push(creator.name);
          emit({ type: "creator-failed", creatorId: creator.channelId });
          return;
        }
        for (const v of videos) {
          if (withinDays(v.publishedAt, 7)) creatorTitles.push({ channel: creator.name, title: v.title, publishedAt: v.publishedAt });
        }
        const { newestSeen: last } = creator;
        const fresh = (last ? videos.filter((v) => v.publishedAt > last).slice(0, PER_REFRESH) : videos.slice(0, FIRST_FETCH)).filter(
          (v) => !stored.has(videoItemId(v.videoId)),
        );
        const newestSeen = videos[0]?.publishedAt;

        if (fresh.length && creator.guidance.trim()) {
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
      runFilter(batch, toFilter, emit, totals),
      runStories(batch, { creatorTitles, recentCards: recentCards(data.items) }, emit, signal, totals),
    ]);
    finish("");
  } catch (err) {
    const e = /** @type {Error} */ (err);
    console.log(`[refresh] failed: ${e.stack ?? e}`);
    finish(e.message);
  }
}

/**
 * @param {number} batch
 * @param {Pending[]} pending
 * @param {Emit} emit
 * @param {Totals} totals
 */
async function runFilter(batch, pending, emit, totals) {
  if (!pending.length) return;
  const flat = pending.flatMap((p) => p.videos.map((video) => ({ video, creator: p.creator })));
  /** @type {Map<number, HiddenBy>} */
  let held = new Map();
  try {
    held = await filterVideos(flat.map((f) => ({ ...f.video, guidance: f.creator.guidance.trim() })));
  } catch (err) {
    console.log(`[refresh] filter failed, letting every video through: ${/** @type {Error} */ (err).message}`);
  }
  /** @type {string[]} */
  const heldIds = [];
  let n = 0;
  for (const p of pending) {
    const entries = p.videos.map((video) => {
      const hiddenBy = held.get(n++);
      if (hiddenBy) heldIds.push(videoItemId(video.videoId));
      return { video, hiddenBy };
    });
    const added = await saveVideos(batch, p.creator.channelId, p.newestSeen, entries);
    totals.videos += added.filter((i) => !i.hiddenBy).length;
  }
  emit({ type: "filtered", heldIds });
}

/**
 * @param {number} batch
 * @param {StoriesInput} input
 * @param {Emit} emit
 * @param {AbortSignal} signal
 * @param {Totals} totals
 */
async function runStories(batch, input, emit, signal, totals) {
  /** @type {Lane[]} */
  let lanes;
  try {
    lanes = await planLanes(input);
  } catch (err) {
    console.log(`[stories] planning failed: ${/** @type {Error} */ (err).message}`);
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
              t.cacheWrite += u.cacheWrite;
              t.cacheRead += u.cacheRead;
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
        const { message } = /** @type {Error} */ (err);
        console.log(`[lane ${lane.name}] failed: ${message}`);
        emit({ type: "lane-done", laneId: lane.id, error: message });
      }
    }),
  );
  const u = totals.usage;
  console.log(
    `[stories] model=${STORIES_MODEL} input=${u.input} cache-write=${u.cacheWrite} cache-read=${u.cacheRead} output=${u.output} searches=${u.searches} fetches=${u.fetches} ` +
      `~$${estimateCost(STORIES_MODEL, u).toFixed(2)} (uncached it would be ~$${uncachedCost(STORIES_MODEL, u).toFixed(2)})`,
  );
}

/** @param {Item[]} items */
function recentCards(items) {
  return items
    .filter((i) => withinDays(i.createdAt, 30))
    .map((i) => ({ label: i.kind === "story" ? i.label : i.moreLabel ?? "", title: i.title, link: i.link }));
}
