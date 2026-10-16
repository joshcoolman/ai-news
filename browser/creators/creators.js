import { boot, del, load, patch, post } from "../shared/api.js";
import { h, sync } from "../shared/dom.js";
import { CREATORS_CHANGED_EVENT, handToHome } from "../shared/handoff.js";
import { historyIds, onHistoryChange } from "../shared/history-link.js";
import { announce, onPlayerMessage, toggleOnSpace } from "../shared/player-link.js";
import { setRefreshing, topBar } from "../shared/top-bar.js";
import { cardEntry, playInPlayer, slotEntries } from "../feed/card.js";
import { atRightEdge, movePick, nearestPick } from "../feed/pick.js";
import { busyLine } from "../feed/status.js";

/*
  The Creators page: recent videos on the left, the creators on the right. The
  page draws before its videos: they load behind placeholders. The
  server keeps the day's lists, so coming back is quick; a reload of this page
  is the ask for fresh ones.
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
  days: Math.min(config.days.max, Math.max(config.days.min, settings.creatorsWindowDays ?? 7)),
  /** The video the player window is playing, if one is; a click queues instead of playing while it is set. */
  playing: /** @type {string | null} */ (null),
  /** Videos in the player's History, marked Queued; clicking one again does nothing. */
  queued: new Set(historyIds()),
  /** The card the keyboard is on, by card id; while set the arrows walk the grid instead of the creator list (#56). */
  picked: /** @type {string | null} */ (null),
};

/** Pick a creator (or none), which lets go of any card the keyboard was on. @param {string | null} channelId */
function pickCreator(channelId) {
  state.selected = channelId;
  state.picked = null;
}

/** Whether this document was loaded by reloading the page. */
function reloadedHere() {
  const nav = /** @type {PerformanceNavigationTiming | undefined} */ (performance.getEntriesByType("navigation")[0]);
  return nav?.type === "reload";
}

/* The parts of the page that stay put; `draw` fills them. */

const windowLabel = h("span");
const range = h("input", {
  type: "range",
  min: config.days.min,
  max: config.days.max,
  step: 1,
  value: state.days,
  "aria-label": "Days of recent videos to show",
  oninput: () => {
    state.days = Number(range.value);
    draw();
  },
  onchange: () => void patch("/api/settings", { creatorsWindowDays: state.days }),
});
const status = h("p", { class: "status creators-status", "aria-live": "polite" });
const grid = h("div", { class: "grid" });
const nothing = h("p", { class: "empty" });
const rows = h("ul", { class: "rows" });
const noCreators = h("p", { class: "empty" }, "No creators. Paste a YouTube URL above to add one.");

document.body.append(
  h(
    "div",
    { class: "wrap" },
    topBar("creators"),
    h("h2", { class: "page-title" }, "Creators"),
    addCreatorForm(loadCreators),
    h("label", { class: "window" }, windowLabel, range),
    h("div", { class: "creators-layout" }, h("section", {}, status, nothing, grid), h("aside", {}, rows, noCreators)),
  ),
);
setRefreshing(config.refreshing);

function draw() {
  const { creators, selected, recent, failed, days, picked } = state;
  const cutoff = Date.now() - days * DAY;
  const loading = recent === null;
  const inWindow = (recent?.cards ?? []).filter((r) => new Date(r.publishedAt).getTime() >= cutoff);
  const listed = inWindow.filter((r) => creators.some((c) => c.channelId === r.channelId));
  // A picked creator is interest in them: their whole cached list (the newest FEED_CAP), whatever the slider says (#54).
  // The counts and status stay on the window, so the sidebar reads the same with or without a pick.
  const shown = selected ? (recent?.cards ?? []).filter((r) => r.channelId === selected) : listed;
  const count = (/** @type {string} */ id) => listed.filter((r) => r.channelId === id).length;
  // The list may have been cut off inside the window, so the count is a floor.
  const capped = (/** @type {string} */ id) => {
    const r = recent?.reach.find((x) => x.channelId === id);
    return !!r?.full && !!r.oldest && new Date(r.oldest).getTime() > cutoff;
  };

  windowLabel.textContent = selected ? `Latest ${config.feedCap}` : `Last ${days} days`;

  status.replaceChildren(
    loading
      ? busyLine(failed ? "Could not read creator feeds. Reload to try again." : `Gathering videos from ${creators.length} creators`)
      : `${listed.length} videos from ${new Set(listed.map((r) => r.channelId)).size} creators`,
  );

  const none = !loading && shown.length === 0;
  nothing.hidden = !none;
  grid.hidden = none;
  nothing.textContent = selected ? "Nothing from this creator." : `Nothing in the last ${days} days.`;
  sync(
    grid,
    loading
      ? slotEntries("loading", PLACEHOLDERS)
      : shown.map((r) => cardEntry(r.card, { onMore: () => explore(r.card), onPlay: () => play(r.card), onQueue: () => unqueue(r.card), mark: markOf(r.card), picked: r.card.id === picked })),
  );

  noCreators.hidden = creators.length > 0;
  sync(
    rows,
    creators.map((c) => {
      const on = selected === c.channelId;
      const n = count(c.channelId);
      const cut = capped(c.channelId);
      return {
        key: c.channelId,
        // Guidance is left out: the input holds its own text while this row stays on screen.
        sig: JSON.stringify([c.name, c.avatarUrl, on, loading, n, cut]),
        make: () =>
          h(
            "li",
            { class: `${on ? "on" : ""}${loading || n ? "" : " none"}` },
            h(
              "button",
              {
                class: "creator-pick",
                type: "button",
                "aria-pressed": on,
                onclick: () => {
                  pickCreator(on ? null : c.channelId);
                  draw();
                },
              },
              c.avatarUrl ? h("img", { class: "avatar", src: c.avatarUrl, alt: "", referrerPolicy: "no-referrer" }) : h("span", { class: "avatar" }),
              h("span", { class: "name" }, c.name),
              loading
                ? h("span", { class: "count count-ghost skeleton" })
                : h("span", { class: "count", title: cut ? `Shows only the newest ${config.feedCap}` : undefined }, `${n}${cut ? "+" : ""}`),
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

/**
 * Paste a video, Shorts, youtu.be, /@handle or /channel/UC… URL.
 * @param {() => void} onAdded
 */
function addCreatorForm(onAdded) {
  const url = h("input", { class: "field url", placeholder: "Paste a YouTube video or channel URL", "aria-label": "YouTube URL" });
  const submit = h("button", { class: "btn primary", type: "submit", disabled: true }, "Add creator");
  const said = h("p", { hidden: true });
  const say = (/** @type {"error" | "ok" | ""} */ kind, text = "") => {
    said.hidden = !kind;
    said.className = kind;
    said.textContent = text;
  };
  const busy = (/** @type {boolean} */ on) => {
    submit.disabled = on || !url.value.trim();
    submit.textContent = on ? "Adding" : "Add creator";
  };
  url.oninput = () => busy(false);
  return h(
    "form",
    {
      class: "add-form",
      onsubmit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        busy(true);
        say("");
        try {
          const res = await post("/api/creators", { url: url.value });
          const data = await res.json();
          if (!res.ok) say("error", data.error ?? "Could not add that creator.");
          else {
            say("ok", data.added ? `Added ${data.creator.name}.` : `${data.creator.name} is already listed.`);
            url.value = "";
            onAdded();
          }
        } catch {
          say("error", "Could not reach the server.");
        }
        busy(false);
      },
    },
    url,
    submit,
    said,
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
const markOf = (card) => (card.videoId && card.videoId === state.playing ? "playing" : card.videoId && state.queued.has(card.videoId) ? "queued" : undefined);

/**
 * A click on a video: the first one plays it in the player window; while the
 * player is playing, each click queues the video right under the one playing
 * and the card is marked once the player has it. A queued card, or the one
 * playing, ignores the click.
 * @param {Card} card
 */
function play(card) {
  if (!card.videoId) return;
  if (!state.playing) return playInPlayer(card);
  if (markOf(card)) return;
  announce({ type: "queue", videoId: card.videoId, title: card.title });
}

/**
 * Shift-click on a queued or playing video: the player drops its row and the
 * card is a plain card again. Dropping the playing one plays the next.
 * @param {Card} card
 */
function unqueue(card) {
  if (!card.videoId || !markOf(card)) return;
  announce({ type: "unqueue", videoId: card.videoId });
}

/**
 * Search the video's topic on home: go there now, and home runs it behind placeholders. Creators stays untouched.
 * @param {Card} card
 */
function explore(card) {
  handToHome({ kind: "video", title: card.title, channel: card.meta.split(" · ")[0] });
}

/* Loading */

/** The videos. `fresh` asks the server to read every list again. */
async function loadVideos(fresh = false) {
  state.failed = false;
  try {
    state.recent = await load(`/api/creators/recent${fresh ? "?fresh=1" : ""}`);
  } catch {
    state.failed = true;
    return draw();
  }
  draw();
}

/** The list of creators changed (added here, in the header, or from the player): read it and their videos again. */
async function loadCreators() {
  state.creators = await load("/api/creators");
  draw();
  await loadVideos();
}

/*
  Two keyboard zones (#56). The sidebar: while a creator is picked, up and down
  move the pick through the list, wrapping at both ends; with none picked they
  are left alone. The grid: Left highlights the right-edge card beside the picked
  creator's row (the nearest on screen), then the arrows walk
  the cards by Home's rules, stopping at the edges, except that Right off the
  right edge (or Escape) drops the highlight and gives the keys back to the
  sidebar. Enter on the highlighted card is its click, queue or play, or on a
  marked card its shift-click, unqueue. No Delete: cards never leave this page.
  A click on a card moves the highlight there; a change of creator drops it.
  A click on empty page (not a card, a control or the sidebar) drops the pick,
  as clicking the picked creator again does.
*/
const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
/** The grid's cards in reading order, as drawn. */
const gridIds = () => [...grid.querySelectorAll(".card[data-id]")].map((c) => /** @type {string} */ (c.getAttribute("data-id")));
/** How many cards share the grid's first row: read from layout, since the grid wraps to the window. */
function columns() {
  const tops = [...grid.querySelectorAll(".card")].map((c) => /** @type {HTMLElement} */ (c).offsetTop);
  return Math.max(1, tops.filter((t) => t === tops[0]).length);
}
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.target instanceof HTMLInputElement) return;
  const { creators, selected, picked } = state;
  const arrow = ARROWS.includes(e.key);
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

window.addEventListener(CREATORS_CHANGED_EVENT, () => void loadCreators());
toggleOnSpace();
onPlayerMessage((msg) => {
  if (msg.type === "creators") return void loadCreators();
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
void loadVideos(reloadedHere());
