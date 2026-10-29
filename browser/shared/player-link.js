/*
  The player window and the app's pages are one origin, so they talk over a
  BroadcastChannel: the player says what it changed, and open pages update in
  place without a reload.
*/

/**
 * From the player: a card's favorite or removal changed, a creator was added (the Creators page picks them),
 * a video was taken into or dropped from its queue, it started playing a
 * video, or its window is going away. To the player, from a page: queue or
 * unqueue this video, or "ping", which a playing player answers with
 * "playing"; or "toggle", pause or play; or "skip", back (-1) or forward (1) as the Player's arrows, "chapters",
 * open or close the Chapters sidebar, "chapter", the one above (-1) or below (1) while it is open, and
 * "transcript", open or close the Transcript sidebar (#85): the one-window shell sends those while the video
 * fills the display (#81), and "remove", the Player's Delete (#83). Nobody answers a "queue" or "toggle" unless a player is playing something.
 * Between the one-window shell and its pages: "toggle-player" from a page's
 * button asks the shell to show or hide the Player frame, and "show-player" is
 * the shell saying which it did.
 * @typedef {{ type: "card", id: string }
 *   | { type: "creators", channelId?: string }
 *   | { type: "queue", videoId: string, title: string }
 *   | { type: "queued", videoId: string }
 *   | { type: "unqueue", videoId: string }
 *   | { type: "unqueued", videoId: string }
 *   | { type: "ping" }
 *   | { type: "toggle" }
 *   | { type: "skip", by: -1 | 1 }
 *   | { type: "chapters" }
 *   | { type: "chapter", by: -1 | 1 }
 *   | { type: "transcript" }
 *   | { type: "remove" }
 *   | { type: "playing", videoId: string }
 *   | { type: "closed" }
 *   | { type: "toggle-player" }
 *   | { type: "show-player", on: boolean }} PlayerMessage
 */

const NAME = "ainews-player";

/** The one-window shell's saved choice to show the Player frame: "no" hides it, anything else shows it while History has rows. */
export const PLAYER_SHOWN_KEY = "app-player-shown";

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
