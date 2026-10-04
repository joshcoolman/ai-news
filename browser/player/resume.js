/** Too close to the start to be worth coming back to. */
const HEAD = 5;
/** Close enough to the end to count as finished. */
const TAIL = 10;

/**
 * Where to pick a video back up, in whole seconds, or undefined to start it
 * over: barely begun, or as good as finished. `duration` is 0 until YouTube
 * reports it.
 * @param {number} time
 * @param {number} duration
 */
export function resumePoint(time, duration) {
  if (!Number.isFinite(time) || time < HEAD) return undefined;
  if (duration > 0 && time > duration - TAIL) return undefined;
  return Math.floor(time);
}
