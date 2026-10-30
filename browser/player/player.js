import { boot, load } from "../shared/api.js";
import { h } from "../shared/dom.js";
import { markAway } from "../shared/away.js";
import { announce, onPlayerMessage } from "../shared/player-link.js";
import { playerBar } from "./bar.js";
import { chapters } from "./chapters.js";
import { fetchTranscript, transcript } from "./transcript.js";
import { playerFrame } from "./frame.js";
import { history, linkTo } from "./history.js";
import { HISTORY_KEY } from "../shared/history-link.js";

/** The last video the Player loaded, so a reload with nothing in the address comes back to it. */
const LAST_KEY = "player-last";

/*
  The player window's page: YouTube's embedded player, the History column beside
  it and the bar under it. Thumbnails load into it (see openInPlayer in
  shared/card.js): `?v=<video id>`, and `&t=<title>` for the window's title and
  for a video the app knows nowhere else.
*/

const query = new URLSearchParams(location.search);
const v = query.get("v") ?? "";
const t = query.get("t") ?? "";
document.title = t || "Player";

/** Where the Player was before it was closed or reloaded: the last video it played, else the newest row, while History still has it. */
function resumeLink() {
  try {
    /** @type {{ videoId: string, title: string }[]} */
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    const last = localStorage.getItem(LAST_KEY);
    const row = list.find((e) => e.videoId === last) ?? list[0];
    return row && `/player?${new URLSearchParams({ v: row.videoId, t: row.title, restore: "1" })}`;
  } catch {}
}

const restore = !/^[A-Za-z0-9_-]{11}$/.test(v) && resumeLink();
if (restore) {
  location.replace(restore);
} else if (!/^[A-Za-z0-9_-]{11}$/.test(v)) {
  document.body.append(h("p", { class: "empty player-empty" }, "Nothing playing. Pick a video on Creators."));
} else {
  await boot();
  markAway();
  try {
    localStorage.setItem(LAST_KEY, v);
  } catch {}
  /** @type {PlayerVideo} */
  const video = await load(`/api/player/video?${new URLSearchParams({ v, t })}`);
  const played = history(video);
  // When the video plays through, the next row that has not been watched to the end starts by itself.
  const player = playerFrame(v, video.title || "Player", () => {
    const next = played.ended();
    if (next) location.href = linkTo(next);
  }, query.get("restore") !== "1");
  const listed = chapters(v, player);
  const read = transcript(v, player);
  // Playing is interest (#85): ask once for the transcript, and mark the row when one comes.
  read.fetch().then((has) => has && played.markTranscript(v));
  /*
    YouTube's own controls answer clicks on the video (#79); the keyboard comes
    back to this page after each (frame.js). The black around the video: a click
    pauses or plays, a double-click, or F, fills the display with the video, and
    Escape (the browser's) brings it back. The whole document goes fullscreen,
    not the stage, so Chapters can sit beside the video (`filled`, #81); inside
    the one window the shell fullscreens this frame and sets `filled` itself.
  */
  const fill = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  if (window.parent === window) {
    document.addEventListener("fullscreenchange", () => document.documentElement.classList.toggle("filled", document.fullscreenElement === document.documentElement));
  }
  const SKIP = 10;
  /** @param {-1 | 1} dir */
  const skip = (dir) => player.seek(Math.max(0, player.time() + dir * SKIP));
  const next = () => {
    const row = played.step(1);
    if (row) location.href = linkTo(row);
  };
  // The mini player's two buttons (#93): the shell sets `mini` on this document, and player.css shows only the video and these.
  /** @param {string} label @param {string} text @param {() => void} act */
  const miniButton = (label, text, act) =>
    h("button", { type: "button", title: label, "aria-label": label, onclick: (/** @type {Event} */ e) => (e.stopPropagation(), act()), ondblclick: (/** @type {Event} */ e) => e.stopPropagation() }, text);
  const controls = h("div", { class: "mini-controls" }, miniButton("Back 10 seconds", "\u21ba", () => skip(-1)), miniButton("Next video", "\u203a", next));
  const stage = h("div", { class: "player-video", onclick: () => player.toggle(), ondblclick: fill }, player.frame, controls);
  document.body.append(
    h("div", { class: "player-page" }, h("div", { class: "player-main" }, stage, played.panel, listed.panel, read.panel), playerBar(video, [listed.button, read.button])),
  );
  played.center();

  /*
    The player's keys, bare arrows and Delete. Up and down: play the row above
    or below in the column, stopping at its ends (each video resumes where this
    window left it); while Chapters or the Transcript is open they walk its
    chapters or paragraphs instead. Space: pause or play. Left and right: back or forward 10 seconds. Delete (Backspace on a
    Mac keyboard, or forward Delete): remove the playing row, as its × does,
    and move on to the row below. F: fill the display.
  */
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const direction = e.key === "ArrowDown" ? 1 : -1;
      if (listed.step(direction) || read.step(direction)) return;
      const row = played.step(direction);
      if (row) location.href = linkTo(row);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      skip(e.key === "ArrowRight" ? 1 : -1);
    } else if (e.key === " " && !(e.target instanceof Element && e.target.closest("input, textarea, select, button, a"))) {
      e.preventDefault();
      player.toggle();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      played.removeCurrent();
    } else if (e.key.toLowerCase() === "f" && !e.repeat && window.parent === window) {
      // Inside the one window the shell owns F, from either half.
      fill();
    }
  });

  // Pages queue into this window while it plays (a plain click on Creators or Favorites): the video goes right under
  // this one and the page hears "queued". They learn that something is playing from "playing", sent on load and in answer to a "ping";
  // a step through History is a page load, so "closed" is followed by the next page's "playing".
  onPlayerMessage(async (msg) => {
    if (msg.type === "toggle") return player.toggle();
    if (msg.type === "skip") return skip(msg.by);
    if (msg.type === "chapters") return listed.toggle();
    if (msg.type === "transcript") return read.toggle();
    if (msg.type === "summary") return read.summarize();
    if (msg.type === "remove") return played.removeCurrent();
    if (msg.type === "chapter") return void (listed.step(msg.by) || read.step(msg.by));
    if (msg.type === "ping") return announce({ type: "playing", videoId: v });
    // Unqueueing the playing row is its Delete: the next row plays. Say so first, since removing the playing row leaves this page.
    if (msg.type === "unqueue") {
      announce({ type: "unqueued", videoId: msg.videoId });
      return played.remove(msg.videoId);
    }
    if (msg.type !== "queue" || msg.videoId === v) return;
    /** @type {PlayerVideo} */
    const info = await load(`/api/player/video?${new URLSearchParams({ v: msg.videoId, t: msg.title })}`);
    played.queue({ videoId: info.videoId, title: info.title, thumbUrl: info.thumbUrl, channel: info.channel, chapters: info.chapters, transcript: info.transcript });
    announce({ type: "queued", videoId: msg.videoId });
    // Queueing is interest (#85): ask once for its transcript, and mark the row when one comes.
    if (!info.transcript) fetchTranscript(info.videoId).then((has) => has && played.markTranscript(info.videoId));
  });
  announce({ type: "playing", videoId: v });
  window.addEventListener("pagehide", () => announce({ type: "closed" }));
}
