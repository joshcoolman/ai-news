import { h } from "../shared/dom.js";
import { setPosition, stopSaving } from "./positions.js";

/** @typedef {{ videoId: string, title: string, thumbUrl: string, channel?: string }} Entry */

/*
  What this window has played, latest arrival first, in sessionStorage: it lives
  exactly as long as the player window and is never saved anywhere else.
*/
const KEY = "player-history";
const CAP = 30;

/**
 * @param {PlayerVideo} video
 * @returns {Entry[]}
 */
function remember(video) {
  const entry = { videoId: video.videoId, title: video.title, thumbUrl: video.thumbUrl, channel: video.channel };
  try {
    /** @type {Entry[]} */
    const before = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    // A video already listed keeps its place: the column is navigation, and rows that move under a click are hard to follow.
    const list = before.some((e) => e.videoId === entry.videoId) ? before : [entry, ...before].slice(0, CAP);
    sessionStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    return [entry];
  }
}

/**
 * Take a video out of the list, along with where it was left.
 * @param {string} videoId
 * @returns {Entry[]}
 */
function forget(videoId) {
  setPosition(videoId, undefined);
  try {
    /** @type {Entry[]} */
    const list = JSON.parse(sessionStorage.getItem(KEY) ?? "[]").filter((/** @type {Entry} */ e) => e.videoId !== videoId);
    sessionStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

const linkTo = (/** @type {Entry} */ e) => `/player?${new URLSearchParams({ v: e.videoId, t: e.title })}`;

/**
 * The history column beside the video: what this window has played, always showing. A new video joins at the top; replaying one leaves the order alone.
 * @param {PlayerVideo} video
 */
export function history(video) {
  let list = remember(video);
  const column = h("ol", { class: "history", "aria-label": "Played in this window" });

  const remove = (/** @type {string} */ videoId) => {
    if (videoId !== video.videoId) {
      list = forget(videoId);
      return draw();
    }
    // Removing what is playing moves on: the row below, or the top one from the bottom row, or an empty player.
    // replace, so Back does not return to the removed video and list it again.
    const at = list.findIndex((e) => e.videoId === videoId);
    const next = list[at + 1] ?? (at > 0 ? list[0] : undefined);
    stopSaving(videoId);
    forget(videoId);
    location.replace(next ? linkTo(next) : "/player");
  };

  const draw = () =>
    column.replaceChildren(
      ...list.map((e) => {
        const current = e.videoId === video.videoId;
        return h(
          "li",
          {},
          h(
            "a",
            { class: current ? "current" : undefined, href: linkTo(e), "aria-current": current ? "true" : undefined },
            h("img", { src: e.thumbUrl, alt: "", loading: "lazy" }),
            h("span", { class: "history-text" }, h("span", { class: "history-title" }, e.title), e.channel && h("span", { class: "history-channel" }, e.channel)),
          ),
          h("button", { class: "history-remove", type: "button", onclick: () => remove(e.videoId), "aria-label": `Remove from history: ${e.title}`, title: "Remove" }, "×"),
        );
      }),
    );
  draw();
  return column;
}
