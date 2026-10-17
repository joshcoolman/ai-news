/*
  Pure rules, kept free of I/O so they can be tested directly.
*/

const DAY = 86_400_000;

/**
 * @param {string} iso
 * @param {number} days
 */
export function withinDays(iso, days, now = Date.now()) {
  return now - new Date(iso).getTime() <= days * DAY;
}

/**
 * The videos worth showing: members-only ones are dropped unless the setting is turned off.
 * @template {{ membersOnly?: boolean }} T
 * @param {T[]} videos
 * @param {{ skipMembersOnly?: boolean }} settings
 * @returns {T[]}
 */
export function playable(videos, settings) {
  return settings.skipMembersOnly === false ? videos : videos.filter((v) => !v.membersOnly);
}

/**
 * Whether a cached channel list is still fresh: lists are read at most twice
 * a day (#67), since creators post a few times a week, not an hour.
 * @param {string | undefined} readAt
 * @param {number} ttlHours
 */
export function listFresh(readAt, ttlHours, now = Date.now()) {
  return !!readAt && now - new Date(readAt).getTime() < ttlHours * 3_600_000;
}
