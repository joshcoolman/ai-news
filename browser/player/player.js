import { boot, load } from "../shared/api.js";
import { h } from "../shared/dom.js";
import { playerBar } from "./bar.js";
import { playerFrame } from "./frame.js";
import { history } from "./history.js";

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
  document.body.append(
    h("div", { class: "player-page" }, h("div", { class: "player-main" }, playerFrame(v, video.title || "Player"), history(video)), playerBar(video)),
  );
}
