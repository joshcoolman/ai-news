import { boot, load, patch, post, send } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { FEED_CHANGED_EVENT, REFRESH_EVENT, SEARCH_EVENT, takeHandoff } from "../shared/handoff.js";
import { onPlayerMessage } from "../shared/player-link.js";
import { setRefreshing, topBar } from "../shared/top-bar.js";
import { cardEntry, slotEntries, slotTile } from "./card.js";
import { favoritePrompt } from "./favorite-prompt.js";
import { apply, optimistic, tiles } from "./live.js";
import { busyLine, progressLine, summaryLine } from "./status.js";

/*
  The home page. Everything on screen is drawn from `state` by `draw`; an action
  changes the state and calls `draw`. The grid goes through `sync`, so only the
  cards whose content changed are touched.
*/

/** The most cards a search (top) or "more like this" (after its card) adds, so this many placeholders hold their place. */
const SEARCH_SLOTS = 8;
const MORE_SLOTS = 4;

const config = await boot();
const [feed, creatorList, settings] = await Promise.all([load("/api/feed"), load("/api/creators"), load("/api/settings")]);
/** @type {{ id: string, name: string }[]} */
const creators = creatorList.map((/** @type {Creator} */ c) => ({ id: c.channelId, name: c.name }));

const state = {
  /** @type {FeedView} */
  view: { cards: feed.cards },
  /** The refresh in progress, as its events have built it. */
  live: /** @type {import("./live.js").Live | null} */ (feed.refresh.running ? optimistic(creators, config.plan) : null),
  summary: /** @type {import("./live.js").Summary | null} */ (null),
  notice: "",
  /** What a running search is doing; while set, placeholders sit where its cards will land. */
  pending: /** @type {string | null} */ (null),
  /** Per card: the note under its thumbnail ("Nothing found"). */
  notes: /** @type {Record<string, string>} */ ({}),
  searching: /** @type {Set<string>} */ (new Set()),
  removed: /** @type {Set<string>} */ (new Set()),
  faved: /** @type {Set<string>} */ (new Set()),
  /** Cards the last search added: they animate in where the placeholders were. */
  arrived: /** @type {Set<string>} */ (new Set()),
  onFavorite: /** @type {Settings["onFavorite"]} */ (settings.onFavorite),
};

const status = h("div", { class: "status", role: "status" });
const grid = h("div", { class: "grid" });
const empty = h("p", { class: "empty" }, "Nothing here yet. Press Refresh to fetch the latest from your creators and the web.");
document.body.append(h("div", { class: "wrap" }, topBar("home"), status, empty, grid));

function drawStatus() {
  const { live, pending, summary, notice } = state;
  status.replaceChildren(...(live ? [progressLine(live, cancel)] : pending ? [busyLine(pending)] : summary ? summaryLine(summary) : [notice]));
}

function draw() {
  const { live, pending, view, removed, faved, notes, searching, arrived } = state;
  drawStatus();
  setRefreshing(!!live);

  const front = live ? tiles(live, removed) : [];
  const frontIds = new Set(front.flatMap((t) => (t.kind === "card" ? [t.card.id] : [])));
  // While a refresh runs, the cards arriving at the front are the new ones.
  const rest = view.cards.filter((c) => !frontIds.has(c.id) && !removed.has(c.id)).map((c) => (live ? { ...c, isNew: false } : c));

  const entry = (/** @type {Card} */ card, /** @type {{ checking?: boolean, arriving?: boolean }} */ extra) =>
    cardEntry(faved.has(card.id) ? { ...card, favorited: true } : card, {
      note: notes[card.id],
      searching: searching.has(card.id),
      onRemove: () => remove(card),
      onMore: () => more(card),
      onFavorite: () => favorite(card),
      ...extra,
    });

  const nothing = front.length === 0 && rest.length === 0 && !pending;
  empty.hidden = !nothing;
  grid.hidden = nothing;
  sync(grid, [
    ...(pending && !live ? slotEntries("search", SEARCH_SLOTS) : []),
    ...front.map((t) =>
      t.kind === "slot"
        ? { key: t.key, sig: JSON.stringify([t.label, t.activity]), make: () => slotTile(t.label, t.activity) }
        : entry(t.card, { checking: t.checking, arriving: true }),
    ),
    ...rest.flatMap((card) => [
      entry(card, { arriving: arrived.has(card.id) }),
      ...(searching.has(card.id) ? slotEntries(`${card.id}-more`, MORE_SLOTS) : []),
    ]),
  ]);
}

async function reload() {
  const res = await send("GET", "/api/feed");
  if (res.ok) state.view = await res.json();
}

/** Reload after a search, marking the cards it added so they animate in. */
async function reloadArriving() {
  const before = new Set(state.view.cards.map((c) => c.id));
  await reload();
  state.arrived = new Set(state.view.cards.filter((c) => !before.has(c.id)).map((c) => c.id));
}

/* Refresh */

/** @type {EventSource | undefined} */
let source;
// The progress line shows a clock, so it is redrawn every second while a refresh runs.
setInterval(() => state.live && drawStatus(), 1000);

/** Follow the running refresh. The server replays its whole log first, so this also re-attaches after a reload. */
function follow() {
  source?.close();
  const es = (source = new EventSource("/api/refresh/events"));
  es.onmessage = async (msg) => {
    /** @type {RefreshEvent | { type: "idle" }} */
    const e = JSON.parse(msg.data);
    if (e.type === "idle" || e.type === "done") {
      es.close();
      await reload();
      state.live = null;
      if (e.type === "done") state.summary = e;
    } else {
      state.live = apply(state.live ?? optimistic([], config.plan), e);
    }
    draw();
  };
}

async function refresh() {
  // Placeholders go up before the request leaves.
  state.live = optimistic(creators, config.plan);
  state.summary = null;
  state.notice = "";
  draw();
  try {
    const res = await post("/api/refresh");
    if (!res.ok && res.status !== 409) throw new Error();
  } catch {
    state.live = null;
    state.notice = "Refresh failed to start. Is the server running?";
    return draw();
  }
  follow();
}

function cancel() {
  void post("/api/refresh/cancel");
}

/* Card actions */

/** @param {Card} card */
async function remove(card) {
  state.removed.add(card.id);
  draw();
  await post(`/api/items/${encodeURIComponent(card.id)}/remove`);
}

/** @param {Card} card */
async function favorite(card) {
  state.faved.add(card.id);
  draw();
  const res = await post(`/api/items/${encodeURIComponent(card.id)}/favorite`);
  if (!res.ok) {
    state.faved.delete(card.id);
    return draw();
  }
  if (state.onFavorite === "remove") await remove(card);
  else if (state.onFavorite === "ask") {
    favoritePrompt(card.label ?? card.title, async (removeFromHome, dontAsk) => {
      if (removeFromHome) await remove(card);
      if (!dontAsk) return;
      state.onFavorite = removeFromHome ? "remove" : "keep";
      await patch("/api/settings", { onFavorite: state.onFavorite });
    });
  }
}

/** @param {Card} card */
async function more(card) {
  state.searching.add(card.id);
  delete state.notes[card.id];
  draw();
  let note = "";
  try {
    const res = await post(`/api/items/${encodeURIComponent(card.id)}/more`);
    const data = await res.json();
    if (!res.ok) note = "Search failed";
    else if (!data.added) note = data.message ?? "Nothing found";
    await reloadArriving();
  } catch {
    note = "Search failed";
  }
  state.searching.delete(card.id);
  if (note) state.notes[card.id] = note;
  draw();
}

/* Search */

/**
 * Runs a search behind placeholders: `run` returns the notice to show (empty when cards were added).
 * @param {string} what
 * @param {() => Promise<string>} run
 */
async function runSearch(what, run) {
  state.summary = null;
  state.notice = "";
  state.pending = what;
  draw();
  try {
    state.notice = await run();
    await reloadArriving();
  } catch {
    state.notice = "Search failed";
  }
  state.pending = null;
  draw();
}

/**
 * @param {string} url
 * @param {unknown} payload
 */
async function searchRequest(url, payload) {
  const res = await post(url, payload);
  const data = await res.json();
  if (res.status === 409) return "A refresh is running. Search again when it finishes.";
  if (!res.ok) return data.error ?? "Search failed";
  return data.added ? "" : (data.message ?? "Nothing found");
}

const search = (/** @type {string} */ query) => runSearch(`Searching for ${query}`, () => searchRequest("/api/search", { query }));
const searchVideo = (/** @type {{ title: string, channel: string }} */ v) =>
  runSearch(`Finding more on: ${v.title}`, () => searchRequest("/api/search/video", v));

/* What reaches the feed from outside it */

// The header's buttons hand their work to the feed when you are on home.
window.addEventListener(REFRESH_EVENT, () => void refresh());
window.addEventListener(SEARCH_EVENT, (e) => void search(/** @type {CustomEvent<{ query: string }>} */ (e).detail.query));
window.addEventListener(FEED_CHANGED_EVENT, async (e) => {
  state.summary = null;
  state.notice = /** @type {CustomEvent<{ notice?: string }>} */ (e).detail?.notice ?? "";
  await reload();
  draw();
});

// The player window favorited, removed or restored a card, or added a creator (whose videos land here).
onPlayerMessage(async (msg) => {
  if (msg.type === "card") state.faved.delete(msg.id);
  await reload();
  draw();
});

draw();
if (feed.refresh.running) follow();

// Work handed over by another page: home is already up, so run it here.
const task = takeHandoff();
if (task?.kind === "refresh") void refresh();
else if (task?.kind === "search") void search(task.query);
else if (task?.kind === "video") void searchVideo({ title: task.title, channel: task.channel });
