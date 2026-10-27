import { h } from "../shared/dom.js";
import { historyIds, onHistoryChange } from "../shared/history-link.js";
import { announce, onPlayerMessage, PLAYER_SHOWN_KEY } from "../shared/player-link.js";

/*
  The single-window shell (#60): the app in the left frame, the Player in the
  right. The Player frame is named `ainews-player`, the name thumbnails open
  into (openInPlayer in feed/card.js), so a click in the left frame loads the
  right one rather than opening a window. Everything else (History, positions,
  BroadcastChannel) is same-origin and needs nothing here. Fullscreen on the
  video fills the display because this is one browser window.

  Shown or hidden (#72): an empty History hides the Player, always. The first
  row into an empty History shows it and resets the saved choice to yes; after
  that the choice is whatever the top bar's button last set. Nothing else
  shows it: a video queued or played while hidden stays hidden.

  Either half collapses: the rail's two arrows (and [ and ], from either half)
  slide it left or right, one step at a time, between the left half alone,
  both, and the Player alone. A collapsed half leaves the rail at the window's
  edge to bring it back. Never both: hiding the Player, or History emptying,
  shows the left half.
*/

const WIDTH_KEY = "app-player-width";
/** "no" collapses the left half, so the Player fills the window. */
const LEFT_KEY = "app-left-shown";
const MIN_APP = 480;
const MIN_PLAYER = 320;

/** @param {string} key */
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
/** @param {string} key @param {string} value */
const save = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

const app = h("iframe", { class: "app-frame", src: "/creators", title: "AI News" });
const player = h("iframe", {
  id: "ainews-player",
  name: "ainews-player",
  src: "/player",
  title: "Player",
  allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
  allowFullscreen: true,
});
/** @param {-1 | 1} dir */
const arrow = (dir) =>
  h("button", { type: "button", onpointerdown: (/** @type {Event} */ e) => e.stopPropagation(), onclick: () => slide(dir) }, dir < 0 ? "\u2039" : "\u203a");
const toLeft = arrow(-1);
const toRight = arrow(1);
const rail = h("div", { class: "app-rail", title: "Drag to resize" }, h("div", { class: "rail-tab" }, toLeft, toRight));

/** @param {number} px */
const setWidth = (px) => (player.style.width = `${Math.round(px)}px`);
const saved = Number(read(WIDTH_KEY));
if (saved > 0) setWidth(saved);

let empty = historyIds().length === 0;
/** @type {boolean | undefined} */
let shown;
let leftShown = true;

/** Show or hide each half by the rules above, and tell the pages when the Player's changes. */
function apply() {
  const on = !empty && read(PLAYER_SHOWN_KEY) !== "no";
  const left = !on || read(LEFT_KEY) !== "no";
  document.body.classList.toggle("player-empty", empty);
  document.body.classList.toggle("app-hidden", !left);
  toLeft.disabled = on && !left;
  toLeft.title = on ? "Hide the left half" : "Show the Player";
  toRight.disabled = !on;
  toRight.title = left ? "Hide the Player" : "Show the left half";
  // A hidden half cannot keep the keyboard: it goes to the other, to the highlight left there.
  if (left !== leftShown && !left) player.contentWindow?.focus();
  leftShown = left;
  if (on === shown) return;
  shown = on;
  document.body.classList.toggle("player-hidden", !on);
  if (!on) app.contentWindow?.focus();
  announce({ type: "show-player", on });
}

/**
 * One step of the split toward the left (-1) or the right (1): ‹ from both hides the left half, from the left half alone shows the Player.
 * @param {-1 | 1} dir
 */
function slide(dir) {
  if (empty) return;
  if (dir < 0 && !shown) save(PLAYER_SHOWN_KEY, "yes");
  else if (dir < 0) save(LEFT_KEY, "no");
  else if (!leftShown) save(LEFT_KEY, "yes");
  else save(PLAYER_SHOWN_KEY, "no");
  apply();
}

function watch() {
  const now = historyIds().length === 0;
  if (empty && !now) {
    save(PLAYER_SHOWN_KEY, "yes");
    save(LEFT_KEY, "yes");
  }
  empty = now;
  apply();
}

onHistoryChange(watch);
onPlayerMessage((msg) => {
  if (msg.type === "queued" || msg.type === "unqueued" || msg.type === "playing") watch();
  if (msg.type === "toggle-player" && !empty) {
    save(PLAYER_SHOWN_KEY, shown ? "no" : "yes");
    save(LEFT_KEY, "yes");
    apply();
  }
});

// The rail drags the split. The iframes would swallow the moves, so they stop taking the pointer while it drags.
rail.addEventListener("pointerdown", (e) => {
  if (!shown || !leftShown) return;
  rail.setPointerCapture(e.pointerId);
  document.body.classList.add("dragging");
});
rail.addEventListener("pointermove", (e) => {
  if (!rail.hasPointerCapture(e.pointerId)) return;
  const max = innerWidth - rail.offsetWidth - MIN_APP;
  setWidth(Math.max(MIN_PLAYER, Math.min(max, innerWidth - e.clientX - rail.offsetWidth / 2)));
});
const stop = () => {
  if (!document.body.classList.contains("dragging")) return;
  document.body.classList.remove("dragging");
  save(WIDTH_KEY, String(player.offsetWidth));
};
rail.addEventListener("pointerup", stop);
rail.addEventListener("lostpointercapture", stop);

/*
  The shell's keys, heard in both halves (#74). Both frames are same-origin, so
  the shell listens inside each page as it loads; the pages know nothing of it.
  Shift+Left gives the keyboard to the app, Shift+Right to the Player while it
  shows. F, from either half, fills the display with the Player's video while
  it shows, and F again (or the browser's Escape) brings it back: only the shell
  may, being the page that holds both. [ and ] slide the split. None of them in
  a text box. While the video fills the display every other key is swallowed,
  except Left and Right, which skip as in the Player, C, Up and Down, which
  open Chapters beside the video and walk them (#81), and Delete, which removes
  the playing row and comes back so the next plays in the normal view (#83),
  whichever half had the keyboard: the shell listens in the capture phase,
  ahead of the pages' own keys.
*/
/** @param {KeyboardEvent} e */
function onKey(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (document.fullscreenElement && e.key.toLowerCase() !== "f" && e.key !== "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.shiftKey) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") announce({ type: "skip", by: e.key === "ArrowLeft" ? -1 : 1 });
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") announce({ type: "chapter", by: e.key === "ArrowUp" ? -1 : 1 });
    else if (e.key.toLowerCase() === "c" && !e.repeat) announce({ type: "chapters" });
    else if ((e.key === "Delete" || e.key === "Backspace") && !e.repeat) {
      announce({ type: "remove" });
      document.exitFullscreen().catch(() => {});
    }
    return;
  }
  if (e.repeat) return;
  // Not `instanceof Element`: a frame's elements belong to that frame's window.
  if (/** @type {Element} */ (e.target).closest?.("input, textarea, select, [contenteditable]")) return;
  if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    if (e.key === "ArrowLeft") app.contentWindow?.focus();
    else if (shown) player.contentWindow?.focus();
  } else if (!e.shiftKey && e.key.toLowerCase() === "f" && (shown || document.fullscreenElement)) {
    e.preventDefault();
    (document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen()).catch(() => {});
  } else if (!e.shiftKey && (e.key === "[" || e.key === "]")) {
    e.preventDefault();
    slide(e.key === "[" ? -1 : 1);
  }
}
window.addEventListener("keydown", onKey, true);
// The whole Player frame goes fullscreen; the page inside covers its column and bar with the video while it is
// (`filled` in player.css), the next page too when up or down steps through History.
const fill = () => player.contentDocument?.documentElement.classList.toggle("filled", document.fullscreenElement === player);
document.addEventListener("fullscreenchange", fill);
player.addEventListener("load", fill);
for (const frame of [app, player]) frame.addEventListener("load", () => frame.contentWindow?.addEventListener("keydown", onKey, true));
// The window opens with the keyboard in the left half, so its green marks show from the start.
app.addEventListener("load", () => app.contentWindow?.focus(), { once: true });

document.body.append(app, rail, player);
apply();
