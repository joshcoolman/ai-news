/*
  Where a chapter key lands. Pure, so it is tested directly.
*/

/** How far into a chapter "previous" still means the chapter before, not the start of this one. */
const GRACE = 3;

/**
 * The time to jump to, or undefined when there is nowhere to go. Forward is
 * the next chapter's start. Back is the start of the chapter playing, or of
 * the one before when it has only just begun (the way a music player's back
 * button works).
 * @param {number[]} starts Chapter start times in seconds, ascending, the first 0.
 * @param {number} time
 * @param {1 | -1} direction
 */
export function chapterTarget(starts, time, direction) {
  if (direction === 1) return starts.find((s) => s > time);
  return starts.findLast((s) => s <= time - GRACE) ?? starts[0];
}
