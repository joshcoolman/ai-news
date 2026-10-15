import { read } from "../store.js";
import { maxBatch, playable, withinDays } from "../feed/rules.js";
import { toCard } from "../feed/cards.js";
import { listChannelVideos } from "../youtube.js";
import { parseChapters } from "../youtube-parse.js";
import { estimateCost, STORIES_MODEL, uncachedCost } from "../ai/client.js";
import { defineName, extractNames } from "../ai/stories.js";
import { STORIES_PER_NAME } from "./events.js";
import { fillAvatars, saveStories, sourcelessStory } from "./save.js";

/*
  A refresh runs as one server-side job that outlives the request that started
  it. Everything it does is appended to an event log; the browser streams that
  log over SSE (replaying it in full on reconnect), so a reload never loses
  progress. The creators are only a signal: their week's titles and chapter
  lines are read for the named things they are about, and each name is
  searched for a page in parallel; a name that finds none is still a card,
  one whose click searches YouTube for it. Only stories land on Home. The lock
  is held until the job ends; a second refresh gets a 409.
*/

/** @typedef {(e: RefreshEvent) => void} Emit */
/** @typedef {{ stories: number, usage: Usage }} Totals */

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
  const totals = { stories: 0, usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, searches: 0, fetches: 0 } };
  /** @type {string[]} */
  const failed = [];
  const finish = (/** @type {string} */ error) =>
    emit({
      type: "done",
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

    /** @type {StoriesInput["creatorTitles"]} */
    const creatorTitles = [];

    // 1. Every creator's list at once, for the week's titles and chapters.
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
          if (withinDays(v.publishedAt, 7)) {
            creatorTitles.push({ channel: creator.name, title: v.title, publishedAt: v.publishedAt, chapters: parseChapters(v.description).map((c) => c.title) });
          }
        }
        emit({ type: "creator-done", creatorId: creator.channelId });
      }),
    );

    // 2. The names in those titles, then one search per name.
    await runStories(batch, { creatorTitles, recentCards: recentCards(data.items) }, emit, signal, totals);
    finish("");
  } catch (err) {
    const e = /** @type {Error} */ (err);
    console.log(`[refresh] failed: ${e.stack ?? e}`);
    finish(e.message);
  }
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
    lanes = await extractNames(input);
  } catch (err) {
    console.log(`[stories] extracting names failed: ${/** @type {Error} */ (err).message}`);
    emit({ type: "lanes", lanes: [], slots: 0 });
    return;
  }
  emit({ type: "lanes", lanes, slots: STORIES_PER_NAME });
  console.log(`[stories] names: ${lanes.map((l) => l.name).join(" | ") || "none"}`);

  await Promise.all(
    lanes.map(async (lane) => {
      const t0 = Date.now();
      try {
        const stories = await defineName(
          lane,
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
        const added = await saveStories(batch, stories.length ? stories : [sourcelessStory(lane)]);
        totals.stories += added.length;
        emit({ type: "stories", laneId: lane.id, cards: added.map((i) => toCard(i, undefined, true)) });
        emit({ type: "lane-done", laneId: lane.id });
        console.log(`[name ${lane.name}] ${stories.length ? "sourced" : "no source"} in ${Math.round((Date.now() - t0) / 1000)}s`);
      } catch (err) {
        if (signal.aborted) return emit({ type: "lane-done", laneId: lane.id, cancelled: true });
        const { message } = /** @type {Error} */ (err);
        console.log(`[name ${lane.name}] failed: ${message}`);
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
