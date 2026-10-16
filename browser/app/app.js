import { h } from "../shared/dom.js";
import { onPlayerMessage } from "../shared/player-link.js";

/*
  The single-window shell (#60): the app in the left frame, the Player in the
  right. The Player frame is named `ainews-player`, the name thumbnails open
  into (openInPlayer in feed/card.js), so a click in the left frame loads the
  right one rather than opening a window. Everything else (History, positions,
  BroadcastChannel) is same-origin and needs nothing here. Fullscreen on the
  video fills the display because this is one browser window.
*/

const KEY = "app-player-shown";
const read = () => {
  try {
    return localStorage.getItem(KEY) !== "no";
  } catch {
    return true;
  }
};

const app = h("iframe", { class: "app-frame", src: "/home", title: "AI News" });
const player = h("iframe", {
  id: "ainews-player",
  name: "ainews-player",
  src: "/player",
  title: "Player",
  allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
  allowFullscreen: true,
});
const toggle = h("button", { class: "app-toggle", type: "button", onclick: () => show(document.body.classList.contains("player-hidden")) }, "");

/** @param {boolean} on */
function show(on) {
  document.body.classList.toggle("player-hidden", !on);
  toggle.textContent = on ? "›" : "‹";
  toggle.title = toggle.ariaLabel = on ? "Hide Player" : "Show Player";
  try {
    localStorage.setItem(KEY, on ? "yes" : "no");
  } catch {}
}

document.body.append(app, h("div", { class: "app-rail" }, toggle), player);
show(read());
// A click that loads a video into a hidden Player brings it back.
onPlayerMessage((msg) => msg.type === "playing" && show(true));
