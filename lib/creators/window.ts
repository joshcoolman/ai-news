/** Days of uploads the Creators page can show. Older videos are never fetched. */
export const MIN_DAYS = 5;
export const MAX_DAYS = 28;
export const DEFAULT_DAYS = 7;

/** Only this many of a channel's newest videos are listed, so a busy channel can be cut off inside the window. */
export const FEED_CAP = 30;

export function clampDays(n: unknown): number {
  const d = Math.round(Number(n));
  return Number.isFinite(d) ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, d)) : DEFAULT_DAYS;
}
