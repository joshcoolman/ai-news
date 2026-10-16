/*
  The player window and the app's pages are one origin, so they talk over a
  BroadcastChannel: the player says what it changed, and open pages update in
  place without a reload.
*/

/**
 * From the player: a card's favorite or removal changed, a creator was added,
 * a video was taken into or dropped from its queue, it started playing a
 * video, or its window is going away. To the player, from a page: queue or
 * unqueue this video, or "ping", which a playing player answers with
 * "playing"; or "toggle", pause or play. Nobody answers a "queue" or "toggle" unless a player is playing something.
 * @typedef {{ type: "card", id: string }
 *   | { type: "creators" }
 *   | { type: "queue", videoId: string, title: string }
 *   | { type: "queued", videoId: string }
 *   | { type: "unqueue", videoId: string }
 *   | { type: "unqueued", videoId: string }
 *   | { type: "ping" }
 *   | { type: "toggle" }
 *   | { type: "playing", videoId: string }
 *   | { type: "closed" }} PlayerMessage
 */

const NAME = "ainews-player";

/** @param {PlayerMessage} msg */
export function announce(msg) {
  const ch = new BroadcastChannel(NAME);
  ch.postMessage(msg);
  ch.close();
}

/**
 * Run `handler` for every message on the channel, this page's own included, for as long as the page lives.
 * @param {(msg: PlayerMessage) => void} handler
 */
export function onPlayerMessage(handler) {
  new BroadcastChannel(NAME).onmessage = (e) => handler(e.data);
}

/** On Space outside anything that takes Space itself, tell the player to pause or play. */
export function toggleOnSpace() {
  window.addEventListener("keydown", (e) => {
    if (e.key !== " " || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
    e.preventDefault();
    announce({ type: "toggle" });
  });
}
