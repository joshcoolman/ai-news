import type { Item } from "./store/types";

/*
  Pure feed rules, kept free of I/O so they can be tested directly.
*/

const DAY = 86_400_000;

/** Highest batch number ever used, hidden items included, so numbers never collide. */
export function maxBatch(items: Item[]): number {
  return items.reduce((m, i) => (i.batch !== undefined && i.batch > m ? i.batch : m), 0);
}

/** The batch whose cards carry the New tag: the newest batch that put something in the feed. */
export function latestBatch(items: Item[]): number | undefined {
  let latest: number | undefined;
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
 */
export function mergeBatch(items: Item[], incoming: Item[], batch: number): Item[] {
  const ids = new Set(items.map((i) => i.id));
  const added: Item[] = [];
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
 */
export function displayOrder(items: Item[]): Item[] {
  const children = new Map<string, Item[]>();
  const top: Item[] = [];
  for (const item of items) {
    if (item.after) {
      const list = children.get(item.after) ?? [];
      list.push(item);
      children.set(item.after, list);
    } else {
      top.push(item);
    }
  }
  const index = new Map(items.map((item, n) => [item.id, n]));
  top.sort((a, b) => (b.batch ?? 0) - (a.batch ?? 0) || index.get(a.id)! - index.get(b.id)!);
  for (const list of children.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || index.get(a.id)! - index.get(b.id)!);
  }

  const out: Item[] = [];
  const visited = new Set<string>();
  const walk = (item: Item) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    if (!item.removedAt && !item.hiddenBy) out.push(item);
    for (const child of children.get(item.id) ?? []) walk(child);
  };
  top.forEach(walk);
  return out;
}

/** Normalise a URL for identity checks: no scheme, no www., no trailing slash, no tracking parameters. */
export function normalizeUrl(input: string): string {
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

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function withinDays(iso: string, days: number, now = Date.now()): boolean {
  return now - new Date(iso).getTime() <= days * DAY;
}
