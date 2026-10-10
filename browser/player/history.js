import { h } from "../shared/dom.js";
import { setPosition, stopSaving } from "./positions.js";
import { neighbor, nextUp, queueAfter } from "./queue.js";

/** @typedef {import("./queue.js").Entry} Entry */

/*
  What this window has played, latest arrival first, in sessionStorage: it lives
  exactly as long as the player window and is never saved anywhere else.
*/
const KEY = "player-history";
/** Videos watched to the end in this window: what auto-play skips. */
const FINISHED = "player-finished";
const CAP = 30;

/** @returns {Set<string>} */
function finished() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(FINISHED) ?? "[]"));
  } catch {
    return new Set();
  }
}

/**
 * @param {string} videoId
 * @param {boolean} on
 */
function setFinished(videoId, on) {
  try {
    const ids = finished();
    if (on) ids.add(videoId);
    else ids.delete(videoId);
    sessionStorage.setItem(FINISHED, JSON.stringify([...ids]));
  } catch {}
}

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
  setFinished(videoId, false);
  try {
    /** @type {Entry[]} */
    const list = JSON.parse(sessionStorage.getItem(KEY) ?? "[]").filter((/** @type {Entry} */ e) => e.videoId !== videoId);
    sessionStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

export const linkTo = (/** @type {Entry} */ e) => `/player?${new URLSearchParams({ v: e.videoId, t: e.title })}`;

/**
 * The history column beside the video: what this window has played, always
 * showing. A new video joins at the top; replaying one leaves the order alone.
 * It is also the queue: `queue` puts a video right under the one playing, and
 * `ended` marks the playing one watched and says what plays next, if anything;
 * `step` is the row above or below, for the keys that walk the column.
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

  const draw = () => {
    column.replaceChildren(
      ...list.map((e) => {
        const current = e.videoId === video.videoId;
        return h(
          "li",
          // Named so the view transition can morph each row from where it was to where it is across the page load a step makes.
          { style: `view-transition-name: h-${e.videoId}` },
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
    center();
  };
  // The playing row sits at the column's vertical middle: the column is padded half its height at both ends so the first and last rows get there too.
  // Instant until the column has been centered once on the page (a step is a page load, and the view transition does the sliding;
  // a smooth scroll here would run from the top on every step). After that, a slide when the list changes in place.
  let settled = false;
  const center = () => {
    column.querySelector("a.current")?.scrollIntoView({ block: "center", behavior: settled ? "smooth" : "instant" });
    settled ||= column.isConnected;
  };
  draw();

  return {
    column,
    /** Scroll the playing row to the middle; call once the column is on the page. */
    center,
    /** @param {Entry} entry */
    queue(entry) {
      list = queueAfter(list, video.videoId, entry).slice(0, CAP);
      // Queued again after being watched, it is wanted again.
      setFinished(entry.videoId, false);
      try {
        sessionStorage.setItem(KEY, JSON.stringify(list));
      } catch {}
      draw();
    },
    ended() {
      setFinished(video.videoId, true);
      return nextUp(list, video.videoId, finished());
    },
    /** The row to step to by key. @param {1 | -1} direction */
    step: (direction) => neighbor(list, video.videoId, direction),
    /** The Delete key: the playing row's ×. */
    removeCurrent: () => remove(video.videoId),
  };
}
