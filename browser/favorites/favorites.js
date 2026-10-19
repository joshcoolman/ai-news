import { boot, del, load } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { historyIds, onHistoryChange } from "../shared/history-link.js";
import { markAway } from "../shared/away.js";
import { announce, onPlayerMessage, toggleOnSpace } from "../shared/player-link.js";
import { topBar } from "../shared/top-bar.js";
import { cardEntry, playInPlayer } from "../shared/card.js";

await boot();

const state = {
  /** @type {Card[]} */
  cards: await load("/api/favorites"),
  /** The video the player window is playing, if one is; a click queues instead of playing while it is set. */
  playing: /** @type {string | null} */ (null),
  /** Videos in the player's History, marked Queued; clicking one again does nothing. A favorite stays a favorite either way. */
  queued: new Set(historyIds()),
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
    cards.map((card) => cardEntry(card, { mark: markOf(card), onPlay: () => play(card), onQueue: () => unqueue(card), onRemove: () => remove(card.id) })),
  );
}

/** @param {string} id */
async function remove(id) {
  state.cards = state.cards.filter((c) => c.id !== id);
  draw();
  await del(`/api/favorites/${encodeURIComponent(id)}`);
}

/* The player: as on Creators, a click plays or queues and the card says so; here it never leaves. */

/** Playing in the sidecar, in its History, or neither. @param {Card} card @returns {"playing" | "queued" | undefined} */
const markOf = (card) => (card.videoId === state.playing ? "playing" : state.queued.has(card.videoId) ? "queued" : undefined);

/**
 * A click on a video: with nothing playing it plays; while the player is
 * playing it is queued right under the one playing. A marked card ignores the click.
 * @param {Card} card
 */
function play(card) {
  if (!state.playing) return playInPlayer(card);
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
