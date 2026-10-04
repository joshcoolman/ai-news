/*
  Header actions (refresh, add creator, search) work from every page. The home
  page owns the feed, so on home they reach it through window events. From
  another page, refresh and search go home and run there: the task waits in
  sessionStorage across the page load, and home takes it as it starts.
*/

export const REFRESH_EVENT = "ainews:refresh";
export const SEARCH_EVENT = "ainews:search";
/** Home's feed changed from outside the feed (a creator was added); `detail.notice` is the line to show. */
export const FEED_CHANGED_EVENT = "ainews:feed-changed";
/** The list of creators changed. */
export const CREATORS_CHANGED_EVENT = "ainews:creators-changed";

/** @typedef {{ kind: "refresh" } | { kind: "search", query: string } | { kind: "video", title: string, channel: string }} HomeTask */

const KEY = "ainews-handoff";

/**
 * Go home and run `task` there, behind placeholders, rather than waiting here and then navigating.
 * @param {HomeTask} task
 */
export function handToHome(task) {
  sessionStorage.setItem(KEY, JSON.stringify(task));
  location.href = "/";
}

/** @returns {HomeTask | null} */
export function takeHandoff() {
  try {
    const task = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    sessionStorage.removeItem(KEY);
    return task;
  } catch {
    return null;
  }
}
