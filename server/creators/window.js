/** Days of uploads the Creators page can show. Nothing here is worth reading after two weeks (#68). */
export const MIN_DAYS = 3;
export const MAX_DAYS = 14;
export const DEFAULT_DAYS = 7;

/** Only this many of a channel's newest videos are listed, so a busy channel can be cut off inside the window. */
export const FEED_CAP = 30;

/** @param {unknown} n */
export function clampDays(n) {
  const d = Math.round(Number(n));
  return Number.isFinite(d) ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, d)) : DEFAULT_DAYS;
}
