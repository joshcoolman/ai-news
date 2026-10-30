import { h } from "../shared/dom.js";
import { load } from "../shared/api.js";
import { HISTORY_KEY } from "../shared/history-link.js";
import { setPosition, stopSaving } from "./positions.js";
import { earlierFrom, neighbor, nextUp, queueAfter } from "./queue.js";

/** @typedef {import("./queue.js").Entry} Entry */

/*
  What the player has played, latest arrival first, in localStorage: the column
  is a curated list that outlives the window, and a row leaves it only by its ×.
  No cap and no expiry, by decision (#47): a cap is a silent expiry.
*/
const KEY = HISTORY_KEY;
/** Videos watched to the end: what auto-play skips. */
const FINISHED = "player-finished";
/** Each opening of the window is a session: a counter in localStorage, this window's number in sessionStorage (a step is a page load in the same window). */
const SESSION = "player-session";

/** This window's session number, taken on its first page load. */
function session() {
  try {
    const mine = sessionStorage.getItem(SESSION);
    if (mine) return Number(mine);
    const next = Number(localStorage.getItem(SESSION) ?? "0") + 1;
    localStorage.setItem(SESSION, String(next));
    sessionStorage.setItem(SESSION, String(next));
    return next;
  } catch {
    return 0;
  }
}
const SESSION_ID = session();

/** @returns {Set<string>} */
function finished() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FINISHED) ?? "[]"));
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
    localStorage.setItem(FINISHED, JSON.stringify([...ids]));
  } catch {}
}

/**
 * @param {PlayerVideo} video
 * @returns {Entry[]}
 */
function remember(video) {
  const entry = { videoId: video.videoId, title: video.title, thumbUrl: video.thumbUrl, channel: video.channel, chapters: video.chapters, transcript: video.transcript, session: SESSION_ID };
  try {
    /** @type {Entry[]} */
    const before = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    // A video already listed keeps its place: the column is navigation, and rows that move under a click are hard to follow.
    // It does learn whether it has chapters, for rows from before the mark. A transcript it already knew of stays known.
    const list = before.some((e) => e.videoId === entry.videoId)
      ? before.map((e) => (e.videoId === entry.videoId ? { ...e, chapters: entry.chapters, transcript: entry.transcript || e.transcript } : e))
      : [entry, ...before];
    localStorage.setItem(KEY, JSON.stringify(list));
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
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]").filter((/** @type {Entry} */ e) => e.videoId !== videoId);
    localStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

export const linkTo = (/** @type {Entry} */ e) => `/player?${new URLSearchParams({ v: e.videoId, t: e.title })}`;

/**
 * The history column beside the video: what the player has played, always
 * showing and kept across windows. A new video joins at the top; replaying one leaves the order alone.
 * It is also the queue: `queue` puts a video right under the one playing, and
 * `ended` marks the playing one watched and says what plays next, if anything;
 * `step` is the row above or below, for the keys that walk the column.
 * @param {PlayerVideo} video
 */
export function history(video) {
  let list = remember(video);
  const column = h("ol", { class: "history", "aria-label": "History" });
  const count = h("span", { class: "panel-count" });
  const panel = h("section", { class: "history-panel" }, h("header", { class: "panel-head" }, h("h2", {}, "History"), count), column);

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
    // A thin line above the first row an earlier opening of the window left behind.
    const earlier = earlierFrom(list, SESSION_ID);
    column.replaceChildren(
      ...list.flatMap((e, i) => {
        const current = e.videoId === video.videoId;
        const row = h(
          "li",
          // Named so the view transition can morph each row from where it was to where it is across the page load a step makes.
          { style: `view-transition-name: h-${e.videoId}` },
          h(
            "a",
            // The playing row has no link: a click on it would reload the Player and start the video over.
            { class: current ? "current" : undefined, href: current ? undefined : linkTo(e), "aria-current": current ? "true" : undefined },
            h(
              "span",
              { class: "history-thumb" },
              h("img", { src: e.thumbUrl, alt: "", loading: "lazy" }),
              (e.chapters || e.transcript) &&
                h("span", { class: "history-marks" }, e.chapters && h("span", { class: "history-mark" }, "C"), e.transcript && h("span", { class: "history-mark" }, "T")),
            ),
            h("span", { class: "history-text" }, h("span", { class: "history-title" }, e.title), e.channel && h("span", { class: "history-channel" }, e.channel)),
          ),
          h("button", { class: "history-remove", type: "button", onclick: () => remove(e.videoId), "aria-label": `Remove from history: ${e.title}`, title: "Remove" }, "×"),
        );
        return i === earlier ? [h("li", { class: "history-divider eyebrow", style: "view-transition-name: h-divider", "aria-hidden": "true" }, "Earlier"), row] : [row];
      }),
    );
    count.textContent = String(list.length);
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
  mark();

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {}
  };

  /**
   * Rows from before a mark do not say whether they have chapters or a transcript; one request to what
   * the server has stored (never YouTube) tells them. A transcript mark is asked every load: a row's
   * transcript may have arrived since, for a video queued while this page was elsewhere.
   */
  async function mark() {
    const ids = list.filter((e) => e.chapters === undefined || !e.transcript).map((e) => e.videoId);
    if (!ids.length) return;
    try {
      /** @type {{ chaptered: string[], transcribed: string[] }} */
      const { chaptered, transcribed } = await load(`/api/player/marks?${new URLSearchParams({ v: ids.join(",") })}`);
      const has = new Set(chaptered);
      const read = new Set(transcribed);
      list = list.map((e) => ({
        ...e,
        chapters: e.chapters === undefined && ids.includes(e.videoId) ? (has.has(e.videoId) ? /** @type {const} */ (true) : false) : e.chapters,
        transcript: e.transcript || (read.has(e.videoId) ? /** @type {const} */ (true) : e.transcript),
      }));
      save();
      draw();
    } catch {}
  }

  return {
    /** The header and the list, for the page. */
    panel,
    /** Scroll the playing row to the middle; call once the column is on the page. */
    center,
    /** @param {Entry} entry */
    queue(entry) {
      list = queueAfter(list, video.videoId, { ...entry, session: SESSION_ID });
      // Queued again after being watched, it is wanted again.
      setFinished(entry.videoId, false);
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
      } catch {}
      draw();
    },
    ended() {
      setFinished(video.videoId, true);
      return nextUp(list, video.videoId, finished());
    },
    /** The row to step to by key. @param {1 | -1} direction */
    step: (direction) => neighbor(list, video.videoId, direction),
    /** A transcript arrived for this row (the playing one, or one just queued): it wears the T. @param {string} videoId */
    markTranscript(videoId) {
      list = list.map((e) => (e.videoId === videoId ? { ...e, transcript: /** @type {const} */ (true) } : e));
      save();
      draw();
    },
    /** The Delete key: the playing row's ×. */
    removeCurrent: () => remove(video.videoId),
    /** A page unqueueing a row: its ×, the playing row's included. @param {string} videoId */
    remove,
  };
}
