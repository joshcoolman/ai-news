import { boot, del, load, post } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { onPlayerMessage } from "../shared/player-link.js";
import { setRefreshing, topBar } from "../shared/top-bar.js";
import { cardEntry, slotEntries } from "../feed/card.js";

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

// The player window starred or unstarred something.
onPlayerMessage(async (msg) => {
  if (msg.type !== "card") return;
  state.cards = await load("/api/favorites");
  draw();
});

draw();
