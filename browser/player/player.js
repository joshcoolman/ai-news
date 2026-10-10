import { boot, load } from "../shared/api.js";
import { h } from "../shared/dom.js";
import { announce, onPlayerMessage } from "../shared/player-link.js";
import { playerBar } from "./bar.js";
import { chapters } from "./chapters.js";
import { playerFrame } from "./frame.js";
import { history, linkTo } from "./history.js";

/*
  The player window's page: YouTube's embedded player, the History column beside
  it and the bar under it. Thumbnails load into it (see openInPlayer in
  feed/card.js): `?v=<video id>`, and `&t=<title>` for the window's title and
  for a video the app knows nowhere else.
*/

const query = new URLSearchParams(location.search);
const v = query.get("v") ?? "";
const t = query.get("t") ?? "";
document.title = t || "Player";

if (!/^[A-Za-z0-9_-]{11}$/.test(v)) {
  document.body.append(h("p", { class: "empty player-empty" }, "Nothing playing. Pick a video from Home."));
} else {
  await boot();
  /** @type {PlayerVideo} */
  const video = await load(`/api/player/video?${new URLSearchParams({ v, t })}`);
  const played = history(video);
  // When the video plays through, the next row that has not been watched to the end starts by itself.
  const player = playerFrame(v, video.title || "Player", () => {
    const next = played.ended();
    if (next) location.href = linkTo(next);
  });
  const listed = chapters(v, player);
  document.body.append(
    h("div", { class: "player-page" }, h("div", { class: "player-main" }, player.frame, played.column, played.lens, listed.panel), playerBar(video, listed.button)),
  );
  played.center();

  /*
    The player's keys, bare arrows and Delete. Up and down: play the row above
    or below in the column, stopping at its ends (each video resumes where this
    window left it); while the Chapters list is open they walk the chapters
    instead. Left and right: back or forward 10 seconds. Delete (Backspace on a
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
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      played.removeCurrent();
    }
  });

  // Home's shift-click: take the video into the queue, right under this one, and say so. Home removes its card on hearing it.
  onPlayerMessage(async (msg) => {
    if (msg.type !== "queue" || msg.videoId === v) return;
    /** @type {PlayerVideo} */
    const info = await load(`/api/player/video?${new URLSearchParams({ v: msg.videoId, t: msg.title })}`);
    played.queue({ videoId: info.videoId, title: info.title, thumbUrl: info.thumbUrl, channel: info.channel });
    announce({ type: "queued", videoId: msg.videoId });
  });
}
