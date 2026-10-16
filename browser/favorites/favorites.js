import { boot, del, load, post } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { historyIds, onHistoryChange } from "../shared/history-link.js";
import { announce, onPlayerMessage } from "../shared/player-link.js";
import { setRefreshing, topBar } from "../shared/top-bar.js";
import { cardEntry, playInPlayer, slotEntries } from "../feed/card.js";

/** The most cards "more like this" adds, so this many placeholders sit after the card while it searches. */
const MORE_SLOTS = 4;

const config = await boot();

const state = {
  /** @type {Card[]} */
  cards: await load("/api/favorites"),
  searching: /** @type {Set<string>} */ (new Set()),
  notes: /** @type {Record<string, string>} */ ({}),
  /** Cards the last search added: they animate in where the placeholders were. */
  arrived: /** @type {Set<string>} */ (new Set()),
  /** The video the player window is playing, if one is; a click queues instead of playing while it is set. */
  playing: /** @type {string | null} */ (null),
  /** Videos in the player's History, marked Queued; clicking one again does nothing. A favorite stays a favorite either way. */
  queued: new Set(historyIds()),
};

const grid = h("div", { class: "grid" });
const empty = h("p", { class: "empty" }, "No favorites yet. Use the star on a card in the feed.");
document.body.append(h("div", { class: "wrap" }, topBar("favorites"), h("h2", { class: "page-title" }, "Favorites"), empty, grid));
setRefreshing(config.refreshing);

function draw() {
  const { cards, searching, notes, arrived } = state;
  empty.hidden = cards.length > 0;
  grid.hidden = cards.length === 0;
  sync(
    grid,
    cards.flatMap((card) => [
      cardEntry(card, {
        note: notes[card.id],
        searching: searching.has(card.id),
        arriving: arrived.has(card.id),
        mark: markOf(card),
        onPlay: () => play(card),
        onQueue: () => unqueue(card),
        onRemove: () => remove(card.id),
        onMore: () => more(card),
      }),
      ...(searching.has(card.id) ? slotEntries(`${card.id}-more`, MORE_SLOTS) : []),
    ]),
  );
}

/** @param {string} id */
async function remove(id) {
  state.cards = state.cards.filter((c) => c.id !== id);
  draw();
  await del(`/api/favorites/${encodeURIComponent(id)}`);
}

/**
 * "More like this" here adds to Favorites only.
 * @param {Card} card
 */
async function more(card) {
  state.searching.add(card.id);
  delete state.notes[card.id];
  draw();
  let note = "";
  try {
    const res = await post(`/api/favorites/${encodeURIComponent(card.id)}/more`);
    const data = await res.json();
    if (!res.ok) note = "Search failed";
    else if (!data.added) note = data.message ?? "Nothing found";
    const had = new Set(state.cards.map((c) => c.id));
    state.cards = await load("/api/favorites");
    state.arrived = new Set(state.cards.filter((c) => !had.has(c.id)).map((c) => c.id));
  } catch {
    note = "Search failed";
  }
  state.searching.delete(card.id);
  if (note) state.notes[card.id] = note;
  draw();
}

/* The player: as on Creators, a click plays or queues and the card says so; here it never leaves. */

/** Playing in the sidecar, in its History, or neither. @param {Card} card @returns {"playing" | "queued" | undefined} */
const markOf = (card) => (card.videoId && card.videoId === state.playing ? "playing" : card.videoId && state.queued.has(card.videoId) ? "queued" : undefined);

/**
 * A click on a video: with nothing playing it plays; while the player is
 * playing it is queued right under the one playing. A marked card ignores the click.
 * @param {Card} card
 */
function play(card) {
  if (!card.videoId) return;
  if (!state.playing) return playInPlayer(card);
  if (markOf(card)) return;
  announce({ type: "queue", videoId: card.videoId, title: card.title });
}

/**
 * Shift-click on a queued or playing video: the player drops its row. Dropping the playing one plays the next.
 * @param {Card} card
 */
function unqueue(card) {
  if (!card.videoId || !markOf(card)) return;
  announce({ type: "unqueue", videoId: card.videoId });
}

// The player window: whether it is playing, or that it starred or unstarred something.
onPlayerMessage(async (msg) => {
  if (msg.type === "playing") state.playing = msg.videoId;
  else if (msg.type === "closed") state.playing = null;
  else if (msg.type === "card") state.cards = await load("/api/favorites");
  else return;
  draw();
});
// The marks follow the player's History itself, so its own × and Delete count too.
onHistoryChange((ids) => {
  state.queued = new Set(ids);
  draw();
});
// Is a player already playing? One that is answers with "playing".
announce({ type: "ping" });

draw();
