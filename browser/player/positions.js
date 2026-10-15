/*
  Where each video was left, in localStorage beside the history: coming back to
  a video picks it up there, and a row's × forgets it along with the row.
*/
const KEY = "player-positions";

/** @returns {Record<string, number>} */
export function positions() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

// Set once the playing video is removed from History: it keeps reporting its time until the page leaves, and that must not bring its position back.
let leaving = false;

/**
 * Save where a video was left; undefined forgets it.
 * @param {string} videoId
 * @param {number | undefined} seconds
 */
export function setPosition(videoId, seconds) {
  if (leaving) return;
  try {
    const all = positions();
    if (seconds === undefined) delete all[videoId];
    else all[videoId] = seconds;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

/**
 * Forget the playing video's position for good; nothing is saved after this until the next page.
 * @param {string} videoId
 */
export function stopSaving(videoId) {
  setPosition(videoId, undefined);
  leaving = true;
}
