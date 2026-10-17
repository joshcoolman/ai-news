import { boot, load } from "../shared/api.js";
import { h } from "../shared/dom.js";
import { announce, onPlayerMessage } from "../shared/player-link.js";
import { playerBar } from "./bar.js";
import { chapters } from "./chapters.js";
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
  document.body.append(
    h("div", { class: "player-page" }, h("div", { class: "player-main" }, player.frame, played.column, listed.panel), playerBar(video, listed.button)),
  );
  played.center();

  /*
    The player's keys, bare arrows and Delete. Up and down: play the row above
    or below in the column, stopping at its ends (each video resumes where this
    window left it); while the Chapters list is open they walk the chapters
    instead. Space: pause or play. Left and right: back or forward 10 seconds. Delete (Backspace on a
    Mac keyboard, or forward Delete): remove the playing row, as its × does,
    and move on to the row below. They reach
    this page only while it has the keyboard: after a click inside the video,
    keys go to YouTube's embed.
  */
  const SKIP = 10;
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const direction = e.key === "ArrowDown" ? 1 : -1;
      if (listed.step(direction)) return;
      const row = played.step(direction);
      if (row) location.href = linkTo(row);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      player.seek(Math.max(0, player.time() + (e.key === "ArrowRight" ? SKIP : -SKIP)));
    } else if (e.key === " " && !(e.target instanceof Element && e.target.closest("input, textarea, select, button, a"))) {
      e.preventDefault();
      player.toggle();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      played.removeCurrent();
    }
  });

  // Pages queue into this window while it plays (a plain click on Creators or Favorites): the video goes right under
  // this one and the page hears "queued". They learn that something is playing from "playing", sent on load and in answer to a "ping";
  // a step through History is a page load, so "closed" is followed by the next page's "playing".
  onPlayerMessage(async (msg) => {
    if (msg.type === "toggle") return player.toggle();
    if (msg.type === "ping") return announce({ type: "playing", videoId: v });
    // Unqueueing the playing row is its Delete: the next row plays. Say so first, since removing the playing row leaves this page.
    if (msg.type === "unqueue") {
      announce({ type: "unqueued", videoId: msg.videoId });
      return played.remove(msg.videoId);
    }
    if (msg.type !== "queue" || msg.videoId === v) return;
    /** @type {PlayerVideo} */
    const info = await load(`/api/player/video?${new URLSearchParams({ v: msg.videoId, t: msg.title })}`);
    played.queue({ videoId: info.videoId, title: info.title, thumbUrl: info.thumbUrl, channel: info.channel, chapters: info.chapters });
    announce({ type: "queued", videoId: msg.videoId });
  });
  announce({ type: "playing", videoId: v });
  window.addEventListener("pagehide", () => announce({ type: "closed" }));
}
