import { boot, load, patch, post, send } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { FEED_CHANGED_EVENT, REFRESH_EVENT, SEARCH_EVENT, takeHandoff } from "../shared/handoff.js";
import { announce, onPlayerMessage, toggleOnSpace } from "../shared/player-link.js";
import { setRefreshing, topBar } from "../shared/top-bar.js";
import { cardEntry, playInPlayer, slotEntries, slotTile } from "./card.js";
import { favoritePrompt } from "./favorite-prompt.js";
import { apply, optimistic, tiles } from "./live.js";
import { movePick, nextPick } from "./pick.js";
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
  /** The video the player window is playing, if one is; a click queues instead of playing while it is set. */
  playing: /** @type {string | null} */ (null),
  /** The card the keyboard highlight is on, if any. */
  picked: /** @type {string | null} */ (null),
  /** The grid's cards in reading order, as last drawn: what the keys move through. */
  shown: /** @type {string[]} */ ([]),
  onFavorite: /** @type {Settings["onFavorite"]} */ (settings.onFavorite),
};

const status = h("div", { class: "status", role: "status" });
const grid = h("div", { class: "grid" });
const empty = h("p", { class: "empty" }, "Nothing here yet. Press Refresh to find what your creators are talking about.");
document.body.append(h("div", { class: "wrap" }, topBar("home"), status, empty, grid));

function drawStatus() {
  const { live, pending, summary, notice } = state;
  status.replaceChildren(...(live ? [progressLine(live, cancel)] : pending ? [busyLine(pending)] : summary ? summaryLine(summary) : [notice]));
}

function draw() {
  const { live, pending, view, removed, faved, notes, searching, arrived, picked } = state;
  drawStatus();
  setRefreshing(!!live);

  const front = live ? tiles(live, removed) : [];
  const frontIds = new Set(front.flatMap((t) => (t.kind === "card" ? [t.card.id] : [])));
  // While a refresh runs, the cards arriving at the front are the new ones.
  const rest = view.cards.filter((c) => !frontIds.has(c.id) && !removed.has(c.id)).map((c) => (live ? { ...c, isNew: false } : c));

  const entry = (/** @type {Card} */ card, /** @type {{ arriving?: boolean }} */ extra) =>
    cardEntry(faved.has(card.id) ? { ...card, favorited: true } : card, {
      note: notes[card.id],
      searching: searching.has(card.id),
      onRemove: () => remove(card),
      onMore: () => more(card),
      onFavorite: () => favorite(card),
      onPlay: () => play(card),
      onSearch: (q) => void search(q),
      picked: card.id === picked,
      ...extra,
    });

  state.shown = [...front.flatMap((t) => (t.kind === "card" ? [t.card.id] : [])), ...rest.map((c) => c.id)];
  const nothing = front.length === 0 && rest.length === 0 && !pending;
  empty.hidden = !nothing;
  grid.hidden = nothing;
  sync(grid, [
    ...(pending && !live ? slotEntries("search", SEARCH_SLOTS) : []),
    ...front.map((t) =>
      t.kind === "slot"
        ? { key: t.key, sig: JSON.stringify([t.label, t.activity]), make: () => slotTile(t.label, t.activity) }
        : entry(t.card, { arriving: true }),
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
  if (state.picked === card.id) state.picked = nextPick(state.shown, card.id) ?? null;
  state.removed.add(card.id);
  draw();
  await post(`/api/items/${encodeURIComponent(card.id)}/remove`);
}

/*
  A click on a video is a decision to watch it, so the card leaves Home either
  way. With nothing playing it plays now. While the player is playing it is
  queued right under the one playing, and the card goes once the player answers
  "queued" (only a player that is playing something does).
*/
/** @type {Map<string, Card>} */
const asked = new Map();

/** @param {Card} card */
function play(card) {
  if (!card.videoId) return;
  if (!state.playing) {
    playInPlayer(card);
    return void remove(card);
  }
  if (asked.has(card.videoId)) return;
  asked.set(card.videoId, card);
  announce({ type: "queue", videoId: card.videoId, title: card.title });
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

// The player window: whether it is playing, a video it took into its queue, a card it favorited, removed or restored.
toggleOnSpace();
onPlayerMessage(async (msg) => {
  if (msg.type === "playing") return void (state.playing = msg.videoId);
  if (msg.type === "closed") return void (state.playing = null);
  if (msg.type === "queued") {
    // The player took it: it leaves home for good, like the × does.
    const card = asked.get(msg.videoId);
    asked.delete(msg.videoId);
    return card && remove(card);
  }
  if (msg.type === "card") state.faved.delete(msg.id);
  else if (msg.type !== "creators") return;
  await reload();
  draw();
});
// Is a player already playing? One that is answers with "playing".
announce({ type: "ping" });

/*
  Keyboard triage: arrows move a highlight through the grid (the first arrow
  picks the first card), Enter acts on the highlighted card and Delete removes
  it, and the highlight moves to the card after the one that left, the first
  from the last. Enter on a topic is its More like this and then its ×, so the
  results land where it was; on a video it is the click, queue or play. A mouse click on a card moves the highlight
  there; Escape drops it. In the search box the keys are typing.
*/
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const { shown, picked } = state;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    state.picked = movePick(shown, picked, e.key, columns()) ?? null;
    draw();
    return grid.querySelector(".card.picked")?.scrollIntoView({ block: "nearest" });
  }
  if (e.key === "Escape" && picked) {
    state.picked = null;
    return draw();
  }
  const card = picked ? cardById(picked) : undefined;
  if (!card) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    void remove(card);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (card.videoId) play(card);
    else {
      void more(card);
      void remove(card);
    }
  }
});
grid.addEventListener("click", (e) => {
  const tile = /** @type {Element} */ (e.target).closest(".card[data-id]");
  if (!tile) return;
  state.picked = tile.getAttribute("data-id");
  draw();
});

/** @param {string} id */
function cardById(id) {
  return state.view.cards.find((c) => c.id === id) ?? state.live?.lanes?.flatMap((l) => l.cards).find((c) => c.id === id);
}

/** How many cards share the grid's first row: read from layout, since the grid wraps to the window. */
function columns() {
  const tops = [...grid.querySelectorAll(".card")].map((c) => /** @type {HTMLElement} */ (c).offsetTop);
  return Math.max(1, tops.filter((t) => t === tops[0]).length);
}

draw();
if (feed.refresh.running) follow();

// Work handed over by another page: home is already up, so run it here.
const task = takeHandoff();
if (task?.kind === "refresh") void refresh();
else if (task?.kind === "search") void search(task.query);
else if (task?.kind === "video") void searchVideo({ title: task.title, channel: task.channel });
