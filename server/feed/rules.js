/*
  Pure feed rules, kept free of I/O so they can be tested directly.
*/

const DAY = 86_400_000;

/**
 * A card as Favorites keeps it: feed-only state dropped, so the copy stands on its own.
 * @param {Item} item
 * @returns {Item}
 */
export function favoriteCopy(item) {
  const { batch, after, removedAt, hiddenBy, moreQuery, moreSeen, searchQuery, ...copy } = item;
  void [batch, after, removedAt, hiddenBy, moreQuery, moreSeen, searchQuery];
  return copy;
}

/**
 * Highest batch number ever used, hidden items included, so numbers never collide.
 * @param {Item[]} items
 */
export function maxBatch(items) {
  return items.reduce((m, i) => (i.batch !== undefined && i.batch > m ? i.batch : m), 0);
}

/**
 * The first `count` results whose video is not already stored. Removed cards stay stored, so they never come back.
 * @template {{ videoId: string }} T
 * @param {Item[]} items
 * @param {T[]} results
 * @param {number} count
 * @returns {T[]}
 */
export function firstUnstored(items, results, count) {
  const have = new Set(items.flatMap((i) => (i.kind === "video" ? [i.videoId] : [])));
  /** @type {T[]} */
  const out = [];
  for (const r of results) {
    if (have.has(r.videoId)) continue;
    have.add(r.videoId);
    out.push(r);
    if (out.length === count) break;
  }
  return out;
}

/**
 * The batch whose cards carry the New tag: the newest batch that put something in the feed.
 * @param {Item[]} items
 */
export function latestBatch(items) {
  /** @type {number | undefined} */
  let latest;
  for (const i of items) {
    if (i.batch === undefined || i.hiddenBy) continue;
    if (latest === undefined || i.batch > latest) latest = i.batch;
  }
  return latest;
}

/**
 * Add a refresh's items to the feed. Items already stored (same id) are skipped,
 * so a removed card is never re-added. Returns the items actually added; an
 * empty result means no batch was created.
 * @template {Item} T
 * @param {Item[]} items
 * @param {T[]} incoming
 * @param {number} batch
 * @returns {T[]}
 */
export function mergeBatch(items, incoming, batch) {
  const ids = new Set(items.map((i) => i.id));
  /** @type {T[]} */
  const added = [];
  for (const item of incoming) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    const stored = { ...item, batch };
    items.push(stored);
    added.push(stored);
  }
  return added;
}

/**
 * Feed order as a tree walk: top-level cards newest batch first (stored order
 * within a batch), each followed by its "more like this" results in the order
 * they were added, each of those followed by its own. Removed cards are
 * skipped but their results keep their place. Hidden cards are never shown.
 * @param {Item[]} items
 */
export function displayOrder(items) {
  const index = new Map(items.map((item, n) => [item.id, n]));
  const at = (/** @type {Item} */ i) => index.get(i.id) ?? 0;
  return treeOrder(items, (a, b) => (b.batch ?? 0) - (a.batch ?? 0) || at(a) - at(b));
}

/**
 * The tree walk behind both the feed and Favorites: top-level items in
 * `compareTop` order, each followed by its results (oldest first), recursively.
 * An item whose parent is gone counts as top-level, so deleting a favorite
 * does not take its results with it.
 * @param {Item[]} items
 * @param {(a: Item, b: Item) => number} compareTop
 */
export function treeOrder(items, compareTop) {
  const ids = new Set(items.map((i) => i.id));
  /** @type {Map<string, Item[]>} */
  const children = new Map();
  /** @type {Item[]} */
  const top = [];
  for (const item of items) {
    if (item.after && ids.has(item.after)) {
      const list = children.get(item.after) ?? [];
      list.push(item);
      children.set(item.after, list);
    } else {
      top.push(item);
    }
  }
  const index = new Map(items.map((item, n) => [item.id, n]));
  const at = (/** @type {Item} */ i) => index.get(i.id) ?? 0;
  top.sort(compareTop);
  for (const list of children.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || at(a) - at(b));
  }

  /** @type {Item[]} */
  const out = [];
  const visited = new Set();
  const walk = (/** @type {Item} */ item) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    if (!item.removedAt && !item.hiddenBy) out.push(item);
    for (const child of children.get(item.id) ?? []) walk(child);
  };
  top.forEach(walk);
  return out;
}

/**
 * Normalise a URL for identity checks: no scheme, no www., no trailing slash, no tracking parameters.
 * @param {string} input
 */
export function normalizeUrl(input) {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|si$|igshid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const query = url.searchParams.toString();
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${host}${pathname}${query ? `?${query}` : ""}`;
  } catch {
    return input.trim().toLowerCase();
  }
}

/** @param {string} url */
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

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
