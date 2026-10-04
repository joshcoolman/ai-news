import { boot, load } from "../shared/api.js";
import { h } from "../shared/dom.js";
import { announce, onPlayerMessage } from "../shared/player-link.js";
import { playerBar } from "./bar.js";
import { chapterTarget } from "./chapters.js";
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
  document.body.append(h("div", { class: "player-page" }, h("div", { class: "player-main" }, player.frame, played.column), playerBar(video)));

  /*
    The player's keys. Up and down, bare: play the row above or below in the
    column, wrapping at both ends. Left and right with Ctrl or Option: the
    previous and next chapter, when the video lists chapters. They reach this
    page only while it has the keyboard: after a click inside the video, keys
    go to YouTube's embed.
  */
  /** @type {number[]} */
  let starts = [];
  load(`/api/player/chapters?${new URLSearchParams({ v })}`).then(
    (found) => (starts = found.chapters.map((/** @type {{ start: number }} */ c) => c.start)),
    () => {},
  );
  window.addEventListener("keydown", (e) => {
    const bare = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    const chapterKey = (e.ctrlKey || e.altKey) && !e.metaKey;
    if (bare && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const row = played.step(e.key === "ArrowDown" ? 1 : -1);
      if (row) location.href = linkTo(row);
    } else if (chapterKey && (e.key === "ArrowRight" || e.key === "ArrowLeft") && starts.length) {
      e.preventDefault();
      const target = chapterTarget(starts, player.time(), e.key === "ArrowRight" ? 1 : -1);
      if (target !== undefined) player.seek(target);
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
