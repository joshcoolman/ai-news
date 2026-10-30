import { boot, del, load } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { historyIds, onHistoryChange } from "../shared/history-link.js";
import { markAway } from "../shared/away.js";
import { announce, onPlayerMessage, toggleOnSpace } from "../shared/player-link.js";
import { topBar } from "../shared/top-bar.js";
import { cardEntry, playInPlayer } from "../shared/card.js";
import { movePick } from "../shared/pick.js";

await boot();

const state = {
  /** @type {Card[]} */
  cards: await load("/api/favorites"),
  /** The video the player window is playing, if one is; a click queues instead of playing while it is set. */
  playing: /** @type {string | null} */ (null),
  /** Videos in the player's History, marked Queued; clicking one again does nothing. A favorite stays a favorite either way. */
  queued: new Set(historyIds()),
  /** The highlighted card, the keyboard's place in the grid. */
  picked: /** @type {string | null} */ (null),
};

const grid = h("div", { class: "grid" });
const empty = h("p", { class: "empty" }, "No favorites yet. Use the star in the Player.");
document.body.append(h("div", { class: "wrap" }, topBar("favorites"), h("h2", { class: "page-title" }, "Favorites"), empty, grid));

function draw() {
  const { cards } = state;
  empty.hidden = cards.length > 0;
  grid.hidden = cards.length === 0;
  sync(
    grid,
    cards.map((card) =>
      cardEntry(card, { mark: markOf(card), picked: card.id === state.picked, onPlay: () => play(card), onQueue: () => unqueue(card), onRemove: () => remove(card.id) }),
    ),
  );
}

/** @param {string} id */
async function remove(id) {
  state.cards = state.cards.filter((c) => c.id !== id);
  if (state.picked === id) state.picked = null;
  draw();
  await del(`/api/favorites/${encodeURIComponent(id)}`);
}

/* The player: as on Creators, a click plays or queues and the card says so; here it never leaves. */

/** Playing in the sidecar, in its History, or neither. @param {Card} card @returns {"playing" | "queued" | undefined} */
const markOf = (card) => (card.videoId === state.playing ? "playing" : state.queued.has(card.videoId) ? "queued" : undefined);

/**
 * A click on a video: with nothing playing it plays; while the player is
 * playing it is queued right under the one playing. A click on a queued card takes it
 * out again (#106); the one playing ignores the click.
 * @param {Card} card
 */
function play(card) {
  if (!state.playing) return playInPlayer(card);
  if (markOf(card) === "queued") return unqueue(card);
  if (markOf(card)) return;
  announce({ type: "queue", videoId: card.videoId, title: card.title });
}

/**
 * Shift-click on a queued or playing video: the player drops its row. Dropping the playing one plays the next.
 * @param {Card} card
 */
function unqueue(card) {
  if (!markOf(card)) return;
  announce({ type: "unqueue", videoId: card.videoId });
}

/*
  The keyboard highlight, as on Creators' grid with no sidebar: an arrow
  highlights the first card, then the arrows walk the cards, stopping at the
  edges; Escape drops it. Enter is the card's click, queue or play, or on a
  marked card its shift-click, unqueue. A click on a card moves it there.
*/
/** How many cards share the grid's first row: read from layout, since the grid wraps to the window. */
function columns() {
  const tops = [...grid.querySelectorAll(".card")].map((c) => /** @type {HTMLElement} */ (c).offsetTop);
  return Math.max(1, tops.filter((t) => t === tops[0]).length);
}
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.target instanceof HTMLInputElement) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    state.picked = movePick(state.cards.map((c) => c.id), state.picked, e.key, columns()) ?? null;
    draw();
    grid.querySelector(".card.picked")?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Escape") {
    state.picked = null;
    draw();
  } else if (e.key === "Enter" && state.picked) {
    e.preventDefault();
    const card = state.cards.find((c) => c.id === state.picked);
    if (card) markOf(card) ? unqueue(card) : play(card);
  }
});
grid.addEventListener("click", (e) => {
  const tile = /** @type {Element} */ (e.target).closest(".card[data-id]");
  if (!tile) return;
  state.picked = tile.getAttribute("data-id");
  draw();
});

// The player window: whether it is playing, or that it starred or unstarred something.
toggleOnSpace();
markAway();
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
