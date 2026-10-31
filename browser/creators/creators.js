import { boot, del, load } from "../shared/api.js";
import { h, icon, sync } from "../shared/dom.js";
import { historyIds, onHistoryChange } from "../shared/history-link.js";
import { markAway } from "../shared/away.js";
import { announce, onPlayerMessage, toggleOnSpace } from "../shared/player-link.js";
import { CREATORS_CHANGED_EVENT, topBar } from "../shared/top-bar.js";
import { busyLine, cardEntry, playInPlayer, slotEntries } from "../shared/card.js";
import { atRightEdge, movePick, nearestPick } from "../shared/pick.js";

/** X's logo, for a creator's X link (#91). */
const GRID = '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />';
const X_LOGO = '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />';

/*
  The Creators page: recent videos on the left, the creators on the right. The
  page draws before its videos: they load behind placeholders. The server
  reads each creator's list at most twice a day (#67); the status line says
  when it last did, and a reload asks for nothing new. Its refresh link reads
  every list now, one unit a creator.
*/

const DAY = 86_400_000;
const PLACEHOLDERS = 8;

const config = await boot();
/** @type {Settings} */
const settings = await load("/api/settings");

const state = {
  /** @type {Creator[]} */
  creators: await load("/api/creators"),
  /** The creator picked in the sidebar, by channel id. */
  selected: /** @type {string | null} */ (null),
  /** Null while the videos load. */
  recent: /** @type {Recent | null} */ (null),
  failed: false,
  /** The window, in days: set on the Settings page (#114). */
  days: Math.min(config.days.max, Math.max(config.days.min, settings.creatorsWindowDays ?? config.days.default)),
  /** The video the player window is playing, if one is; a click queues instead of playing while it is set. */
  playing: /** @type {string | null} */ (null),
  /** Videos in the player's History, marked Queued; clicking one again takes it out (#106). */
  queued: new Set(historyIds()),
  /** The card the keyboard is on, by card id; while set the arrows walk the grid instead of the creator list (#56). */
  picked: /** @type {string | null} */ (null),
};

/** Pick a creator (or none), which lets go of any card the keyboard was on. @param {string | null} channelId */
function pickCreator(channelId) {
  state.selected = channelId;
  state.picked = null;
}

/* The parts of the page that stay put; `draw` fills them. */

const status = h("p", { class: "status creators-status", "aria-live": "polite" });
/** The picked creator, named above the grid so the focus is plain (#114). */
const focusHead = h("div", { class: "focus-head", hidden: true });
const grid = h("div", { class: "grid" });
const nothing = h("p", { class: "empty" });
const rows = h("ul", { class: "rows" });
const noCreators = h("p", { class: "empty" }, "No creators yet. Add one with the + at the top.");
const creatorCount = h("span", { class: "panel-count" });
/** Pinned above the list, a row like the others: lets go of the picked creator, back to everyone's videos. */
const everyone = h(
  "div",
  { class: "all-creators" },
  h(
    "button",
    {
      class: "creator-pick",
      type: "button",
      onclick: () => {
        pickCreator(null);
        draw();
      },
    },
    h("span", { class: "avatar all-icon" }, icon(GRID, { size: 16, stroke: 1.8 })),
    h("span", { class: "name" }, "All creators"),
    creatorCount,
  ),
);

document.body.append(
  h(
    "div",
    { class: "wrap" },
    topBar("creators"),
    // One line over the grid, held under the top bar as it scrolls: when the lists were read, or the picked creator (#116).
    h("div", { class: "creators-layout" }, h("section", {}, h("div", { class: "grid-head" }, status, focusHead), nothing, grid), h("aside", {}, everyone, rows, noCreators)),
  ),
);

const refresh = h("button", { class: "link-btn", type: "button", onclick: () => void loadVideos(true) }, "refresh");

/** "Read 3 hours ago": when the oldest list on the page was read. @param {string} iso */
function readAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return "Read just now";
  const hours = Math.floor(minutes / 60);
  return `Read ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

function draw() {
  const { creators, selected, recent, failed, days, picked } = state;
  const cutoff = Date.now() - days * DAY;
  const loading = recent === null;
  const inWindow = (recent?.cards ?? []).filter((r) => new Date(r.publishedAt).getTime() >= cutoff);
  const listed = inWindow.filter((r) => creators.some((c) => c.channelId === r.channelId));
  // A picked creator is interest in them: their whole cached list (the newest FEED_CAP), whatever the slider says (#54).
  // The gray rows and status stay on the window, so the sidebar reads the same with or without a pick.
  const shown = selected ? (recent?.cards ?? []).filter((r) => r.channelId === selected) : listed;
  // A creator with nothing in the window is grayed out; how many they have does not matter.
  const active = new Set(listed.map((r) => r.channelId));

  const focused = creators.find((c) => c.channelId === selected);
  focusHead.hidden = !focused;
  status.hidden = !!focused;
  if (focused && focusHead.dataset.id !== focused.channelId) {
    focusHead.dataset.id = focused.channelId;
    focusHead.replaceChildren(
      focused.avatarUrl ? h("img", { class: "avatar", src: focused.avatarUrl, alt: "", referrerPolicy: "no-referrer" }) : h("span", { class: "avatar" }),
      h("h3", {}, focused.name),
    );
  }

  status.replaceChildren(
    ...(loading
      ? [busyLine(failed ? "Could not read creator feeds. Reload to try again." : `Gathering videos from ${creators.length} creators`)]
      : recent.failed
        ? [busyLine(`${recent.failed} Reload to try again.`)]
        : [recent.readAt ? `${readAgo(recent.readAt)} · ` : "", refresh]),
  );

  const none = !loading && shown.length === 0;
  nothing.hidden = !none;
  grid.hidden = none;
  nothing.textContent = selected ? "Nothing from this creator." : `Nothing in the last ${days} days.`;
  sync(
    grid,
    loading
      ? slotEntries("loading", PLACEHOLDERS)
      : shown.map((r) => cardEntry(r.card, { onPlay: () => play(r.card), onQueue: () => unqueue(r.card), mark: markOf(r.card), picked: r.card.id === picked })),
  );

  noCreators.hidden = creators.length > 0;
  everyone.hidden = !creators.length;
  everyone.firstElementChild?.setAttribute("aria-pressed", String(!selected));
  creatorCount.textContent = String(creators.length);
  sync(
    rows,
    creators.map((c) => {
      const on = selected === c.channelId;
      const any = active.has(c.channelId);
      return {
        key: c.channelId,
        sig: JSON.stringify([c.name, c.avatarUrl, c.xUrl, on, loading, any]),
        make: () =>
          h(
            "li",
            { class: `${on ? "on" : ""}${loading || any ? "" : " none"}` },
            h(
              "div",
              { class: "creator-line" },
              h(
                "button",
                {
                  class: "creator-pick",
                  type: "button",
                  title: c.name,
                  "aria-pressed": on,
                  onclick: () => {
                    pickCreator(on ? null : c.channelId);
                    draw();
                  },
                },
                c.avatarUrl ? h("img", { class: "avatar", src: c.avatarUrl, alt: "", referrerPolicy: "no-referrer" }) : h("span", { class: "avatar" }),
                h("span", { class: "name" }, c.name),
              ),
              // Only the X profile the creator's own YouTube About page lists (#91); none there, none here.
              c.xUrl && h("a", { class: "x-link", href: c.xUrl, target: "_blank", rel: "noopener noreferrer", title: `${c.name} on X`, "aria-label": `${c.name} on X` }, icon(X_LOGO, { size: 14, stroke: 0, fill: "currentColor" })),
            ),
            on &&
              h(
                "div",
                { class: "row-main" },
                h("button", { class: "link-btn", type: "button", onclick: () => remove(c), "aria-label": `Delete ${c.name}` }, "Delete creator"),
              ),
          ),
      };
    }),
  );
}

/** @param {Creator} c */
async function remove(c) {
  state.creators = state.creators.filter((x) => x.channelId !== c.channelId);
  if (state.selected === c.channelId) pickCreator(null);
  draw();
  await del(`/api/creators/${c.channelId}`);
}

/** Playing in the sidecar, in its History, or neither. @param {Card} card @returns {"playing" | "queued" | undefined} */
const markOf = (card) => (card.videoId === state.playing ? "playing" : state.queued.has(card.videoId) ? "queued" : undefined);

/**
 * A click on a video: the first one plays it in the player window; while the
 * player is playing, each click queues the video right under the one playing
 * and the card is marked once the player has it. A click on a queued card takes
 * it out again (#106); the one playing ignores the click.
 * @param {Card} card
 */
function play(card) {
  if (!state.playing) return playInPlayer(card);
  if (markOf(card) === "queued") return unqueue(card);
  if (markOf(card)) return;
  announce({ type: "queue", videoId: card.videoId, title: card.title });
}

/**
 * Shift-click on a queued or playing video: the player drops its row and the
 * card is a plain card again. Dropping the playing one plays the next.
 * @param {Card} card
 */
function unqueue(card) {
  if (!markOf(card)) return;
  announce({ type: "unqueue", videoId: card.videoId });
}

/* Loading */

/** @param {boolean} [fresh] read every creator's list now, however recently it was read */
async function loadVideos(fresh = false) {
  state.failed = false;
  if (fresh) {
    state.recent = null;
    draw();
  }
  try {
    state.recent = await load(`/api/creators/recent${fresh ? "?fresh=1" : ""}`);
  } catch {
    state.failed = true;
    return draw();
  }
  draw();
}

/**
 * The list of creators changed (added from the header's +, or from the player): read it and their videos again.
 * A creator just added is picked, so their videos are what the grid shows.
 * @param {string} [added]
 */
async function loadCreators(added) {
  state.creators = await load("/api/creators");
  if (added && state.creators.some((c) => c.channelId === added)) pickCreator(added);
  draw();
  rows.querySelector("li.on")?.scrollIntoView({ block: "nearest" });
  await loadVideos();
}

/*
  Two keyboard zones (#56). The sidebar: while a creator is picked, up and down
  move the pick through the list, wrapping at both ends; with none picked they
  are left alone. The grid: Left highlights the right-edge card beside the picked
  creator's row (the nearest on screen), then the arrows walk the cards,
  stopping at the edges, except that Right off the right edge (or Escape) drops
  the highlight and gives the keys back to the sidebar. Enter on the highlighted
  card is its click, queue or play, or on a marked card its shift-click, unqueue.
  A click on a card moves the highlight there; a change of creator drops it.
  A click on empty page (not a card, a control or the sidebar) drops the pick,
  as clicking the picked creator again does, and so does All creators, pinned
  above the list, or Escape once no card is highlighted, unless Escape is
  someone else's: a dialog open, a text box, the video filling the display.
  C, from anywhere on the page,
  picks the first creator, or with one picked lets go and goes back to the card
  highlighted before (else the first).
*/
const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
/** The card highlighted on everyone's view when C picked the first creator, to come back to on the next C. @type {string | null} */
let before = null;
/** The grid's cards in reading order, as drawn. */
const gridIds = () => [...grid.querySelectorAll(".card[data-id]")].map((c) => /** @type {string} */ (c.getAttribute("data-id")));
/** How many cards share the grid's first row: read from layout, since the grid wraps to the window. */
function columns() {
  const tops = [...grid.querySelectorAll(".card")].map((c) => /** @type {HTMLElement} */ (c).offsetTop);
  return Math.max(1, tops.filter((t) => t === tops[0]).length);
}
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
  if (/** @type {Element} */ (e.target).closest?.("input, textarea, select, [contenteditable], dialog")) return;
  const { creators, selected, picked } = state;
  const arrow = ARROWS.includes(e.key);
  // C toggles between the first creator, picked from the top, and everyone's, back on the card highlighted before
  // the first C (else the first card, from the top).
  if (e.key.toLowerCase() === "c" && !e.repeat) {
    e.preventDefault();
    rows.closest("aside")?.scrollTo(0, 0);
    if (selected) {
      pickCreator(null);
      draw();
      const ids = gridIds();
      state.picked = before && ids.includes(before) ? before : (ids[0] ?? null);
      draw();
      if (state.picked === before) return grid.querySelector(".card.picked")?.scrollIntoView({ block: "center" });
    } else if (creators[0]) {
      before = picked;
      pickCreator(creators[0].channelId);
      draw();
    }
    return window.scrollTo(0, 0);
  }
  if (picked) {
    if (arrow) {
      e.preventDefault();
      const ids = gridIds();
      state.picked = e.key === "ArrowRight" && atRightEdge(ids, picked, columns()) ? null : (movePick(ids, picked, /** @type {any} */ (e.key), columns()) ?? null);
      draw();
      grid.querySelector(".card.picked")?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Escape") {
      state.picked = null;
      draw();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const card = state.recent?.cards.find((r) => r.card.id === picked)?.card;
      if (card) markOf(card) ? unqueue(card) : play(card);
    }
    return;
  }
  if (e.key === "Escape") {
    // Not while a dialog is open (the header's Add creator) or the one window's video fills the display.
    if (!selected || document.querySelector("dialog[open]") || window.top?.document.fullscreenElement) return;
    pickCreator(null);
    return draw();
  }
  if (e.key === "ArrowLeft") {
    // Land beside what the eye is on: the right-edge card nearest the picked creator's row, or the middle of the
    // window when none is picked or the row is scrolled out of view. It is on screen already, so at most a nudge
    // to bring a partly hidden card fully in, never a jump (#58).
    const row = rows.querySelector("li.on")?.getBoundingClientRect();
    const seen = row && row.bottom > 0 && row.top < window.innerHeight;
    const y = seen ? (row.top + row.bottom) / 2 : window.innerHeight / 2;
    const cards = [...grid.querySelectorAll(".card[data-id]")].map((c) => {
      const r = c.getBoundingClientRect();
      return { id: /** @type {string} */ (c.getAttribute("data-id")), top: r.top, bottom: r.bottom };
    });
    const id = nearestPick(y, cards, columns());
    if (!id) return;
    e.preventDefault();
    state.picked = id;
    draw();
    return grid.querySelector(".card.picked")?.scrollIntoView({ block: "nearest" });
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const at = creators.findIndex((c) => c.channelId === selected);
  if (at < 0) return;
  e.preventDefault();
  pickCreator(creators[(at + (e.key === "ArrowDown" ? 1 : -1) + creators.length) % creators.length].channelId);
  draw();
  rows.querySelector("li.on")?.scrollIntoView({ block: "nearest" });
});
grid.addEventListener("click", (e) => {
  const tile = /** @type {Element} */ (e.target).closest(".card[data-id]");
  if (!tile) return;
  state.picked = tile.getAttribute("data-id");
  draw();
});
document.addEventListener("click", (e) => {
  const at = /** @type {Element} */ (e.target);
  if (!state.selected || at.closest("aside, .card, button, a, input, label, dialog")) return;
  pickCreator(null);
  draw();
});

window.addEventListener(CREATORS_CHANGED_EVENT, (e) => void loadCreators(/** @type {CustomEvent} */ (e).detail?.channelId));
toggleOnSpace();
markAway();
onPlayerMessage((msg) => {
  if (msg.type === "creators") return void loadCreators(msg.channelId);
  if (msg.type === "playing") state.playing = msg.videoId;
  else if (msg.type === "closed") state.playing = null;
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
void loadVideos();
