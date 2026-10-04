/*
  The player window and the app's pages are one origin, so they talk over a
  BroadcastChannel: the player says what it changed, and open pages update in
  place without a reload.
*/

/**
 * A card's favorite or removal changed, or a creator was added.
 * @typedef {{ type: "card", id: string } | { type: "creators" }} PlayerMessage
 */

const NAME = "ainews-player";

/** @param {PlayerMessage} msg */
export function announce(msg) {
  const ch = new BroadcastChannel(NAME);
  ch.postMessage(msg);
  ch.close();
}

/**
 * Run `handler` for every message the player sends, for as long as the page lives.
 * @param {(msg: PlayerMessage) => void} handler
 */
export function onPlayerMessage(handler) {
  new BroadcastChannel(NAME).onmessage = (e) => handler(e.data);
}
