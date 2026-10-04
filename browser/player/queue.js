/*
  The two rules of the queue, pure so they are tested directly. The History
  column is the queue: a video queued from Home goes right under the one
  playing, and when a video ends the player moves down the column.
*/

/** @typedef {{ videoId: string, title: string, thumbUrl: string, channel?: string }} Entry */

/**
 * The list with `entry` directly under the playing video. One already listed
 * moves there; queueing the playing video itself changes nothing.
 * @param {Entry[]} list
 * @param {string} playingId
 * @param {Entry} entry
 * @returns {Entry[]}
 */
export function queueAfter(list, playingId, entry) {
  if (entry.videoId === playingId) return list;
  const rest = list.filter((e) => e.videoId !== entry.videoId);
  const at = rest.findIndex((e) => e.videoId === playingId);
  return [...rest.slice(0, at + 1), entry, ...rest.slice(at + 1)];
}

/**
 * What plays when the playing video ends: the first row under it that has not
 * been watched to the end in this window. Rows under the playing video are
 * otherwise older history, and those must not replay one after another.
 * @param {Entry[]} list
 * @param {string} playingId
 * @param {Set<string>} finished
 */
export function nextUp(list, playingId, finished) {
  const at = list.findIndex((e) => e.videoId === playingId);
  return at < 0 ? undefined : list.slice(at + 1).find((e) => !finished.has(e.videoId));
}

/**
 * The row above or below the playing video, for stepping through the column
 * by key. It wraps: down from the last row is the first, up from the first is
 * the last. Nothing when the playing video is the only row.
 * @param {Entry[]} list
 * @param {string} playingId
 * @param {1 | -1} direction 1 is down the column.
 */
export function neighbor(list, playingId, direction) {
  const at = list.findIndex((e) => e.videoId === playingId);
  if (at < 0 || list.length < 2) return undefined;
  return list[(at + direction + list.length) % list.length];
}
