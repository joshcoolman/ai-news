/*
  The Player's History column is localStorage on this origin, so a page can read
  what is in it directly and hear every change through the `storage` event. The
  Queued and Playing marks on Creators and Favorites come from here, not from
  messages: a row removed with the Player's own × or Delete, or queued before
  this page opened, is still accounted for (#52).
*/

/** The Player's History list: what it has played and what is queued, latest arrival first. */
export const HISTORY_KEY = "player-history";

/** The video ids in the Player's History, in column order. @returns {string[]} */
export function historyIds() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]").map((/** @type {{ videoId: string }} */ e) => e.videoId);
  } catch {
    return [];
  }
}

/**
 * Run `handler` whenever another window changes the History (the `storage` event does not fire in the window that wrote).
 * @param {(ids: string[]) => void} handler
 */
export function onHistoryChange(handler) {
  window.addEventListener("storage", (e) => {
    if (e.key === HISTORY_KEY || e.key === null) handler(historyIds());
  });
}
