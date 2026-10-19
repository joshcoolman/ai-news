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
*/

const WIDTH_KEY = "app-player-width";
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
const rail = h("div", { class: "app-rail", title: "Drag to resize" });

/** @param {number} px */
const setWidth = (px) => (player.style.width = `${Math.round(px)}px`);
const saved = Number(read(WIDTH_KEY));
if (saved > 0) setWidth(saved);

let empty = historyIds().length === 0;
/** @type {boolean | undefined} */
let shown;

/** Show or hide the Player by the rule above, and tell the pages when that changes. */
function apply() {
  const on = !empty && read(PLAYER_SHOWN_KEY) !== "no";
  if (on === shown) return;
  shown = on;
  document.body.classList.toggle("player-hidden", !on);
  announce({ type: "show-player", on });
}

function watch() {
  const now = historyIds().length === 0;
  if (empty && !now) save(PLAYER_SHOWN_KEY, "yes");
  empty = now;
  apply();
}

onHistoryChange(watch);
onPlayerMessage((msg) => {
  if (msg.type === "queued" || msg.type === "unqueued" || msg.type === "playing") watch();
  if (msg.type === "toggle-player" && !empty) {
    save(PLAYER_SHOWN_KEY, shown ? "no" : "yes");
    apply();
  }
});

// The rail drags the split. The iframes would swallow the moves, so they stop taking the pointer while it drags.
rail.addEventListener("pointerdown", (e) => {
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
  may, being the page that holds both. None of them in a text box. While the
  video fills the display every other key is swallowed: the shell listens in the
  capture phase, ahead of the pages' own keys.
*/
/** @param {KeyboardEvent} e */
function onKey(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (document.fullscreenElement && e.key.toLowerCase() !== "f" && e.key !== "Escape") {
    e.preventDefault();
    return e.stopImmediatePropagation();
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
  }
}
window.addEventListener("keydown", onKey, true);
// The whole Player frame goes fullscreen; the page inside covers its column and bar with the video while it is
// (`filled` in player.css), the next page too when up or down steps through History.
const fill = () => player.contentDocument?.documentElement.classList.toggle("filled", document.fullscreenElement === player);
document.addEventListener("fullscreenchange", fill);
player.addEventListener("load", fill);
for (const frame of [app, player]) frame.addEventListener("load", () => frame.contentWindow?.addEventListener("keydown", onKey, true));

document.body.append(app, rail, player);
apply();
