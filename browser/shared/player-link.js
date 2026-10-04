/*
  The player window and the app's pages are one origin, so they talk over a
  BroadcastChannel: the player says what it changed, and open pages update in
  place without a reload.
*/

/**
 * From the player: a card's favorite or removal changed, a creator was added,
 * or a video was taken into its queue. To the player, from Home: queue this
 * video. Nobody answers a "queue" unless a player is playing something.
 * @typedef {{ type: "card", id: string }
 *   | { type: "creators" }
 *   | { type: "queue", videoId: string, title: string }
 *   | { type: "queued", videoId: string }} PlayerMessage
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
