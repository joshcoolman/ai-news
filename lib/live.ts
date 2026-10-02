import type { Card } from "./view";
import { LANES, STORIES_PER_LANE, type RefreshEvent } from "./refresh-events";

/*
  The browser's view of a refresh in progress, built only from the event log so
  a replay after reload produces exactly the same state. Pure; no React.
*/

export type LiveCreator = { id: string; name: string; status: "pending" | "done" | "failed"; cards: Card[]; checking: boolean };
export type LiveLane = { id: string; name: string; status: "pending" | "done"; cards: Card[]; activity?: string };

export type Summary = Extract<RefreshEvent, { type: "done" }>;

export type Live = {
  startedAt: number;
  creators: LiveCreator[];
  /** Null until the planner names the lanes; placeholder slots show meanwhile. */
  lanes: LiveLane[] | null;
  slotsPerLane: number;
  held: Set<string>;
  usd: number;
  searches: number;
  done?: Summary;
};

/** The state drawn the instant Refresh is clicked, before the server answers. */
export function optimistic(creators: { id: string; name: string }[]): Live {
  return {
    startedAt: Date.now(),
    creators: creators.map((c) => ({ ...c, status: "pending", cards: [], checking: false })),
    lanes: null,
    slotsPerLane: STORIES_PER_LANE,
    held: new Set(),
    usd: 0,
    searches: 0,
  };
}

export function apply(live: Live, e: RefreshEvent): Live {
  switch (e.type) {
    case "start":
      // Replays begin here, so this resets everything.
      return { ...optimistic(e.creators), startedAt: new Date(e.startedAt).getTime() };
    case "videos":
      return {
        ...live,
        creators: live.creators.map((c) => (c.id === e.creatorId ? { ...c, status: "done", cards: e.cards, checking: e.checking } : c)),
      };
    case "creator-failed":
      return { ...live, creators: live.creators.map((c) => (c.id === e.creatorId ? { ...c, status: "failed" } : c)) };
    case "filtered":
      return {
        ...live,
        held: new Set([...live.held, ...e.heldIds]),
        creators: live.creators.map((c) => ({ ...c, checking: false })),
      };
    case "lanes":
      return {
        ...live,
        slotsPerLane: e.slots,
        lanes: e.lanes.map((l) => ({ id: l.id, name: l.name, status: "pending", cards: [] })),
      };
    case "activity":
      return { ...live, lanes: mapLane(live.lanes, e.laneId, (l) => ({ ...l, activity: e.text })) };
    case "stories":
      return { ...live, lanes: mapLane(live.lanes, e.laneId, (l) => ({ ...l, cards: [...l.cards, ...e.cards] })) };
    case "lane-done":
      return { ...live, lanes: mapLane(live.lanes, e.laneId, (l) => ({ ...l, status: "done", activity: undefined })) };
    case "cost":
      return { ...live, usd: e.usd, searches: e.searches };
    case "done":
      return { ...live, done: e, usd: e.usd };
  }
}

function mapLane(lanes: LiveLane[] | null, id: string, fn: (l: LiveLane) => LiveLane): LiveLane[] | null {
  return lanes && lanes.map((l) => (l.id === id ? fn(l) : l));
}

/** One thing to draw at the front of the grid: a real card, or a slot still waiting. */
export type LiveTile =
  | { kind: "card"; card: Card; checking: boolean }
  | { kind: "slot"; key: string; label: string; activity?: string };

/**
 * The front of the feed during a refresh: each creator's videos (or a slot
 * while its feed loads), then each lane's stories followed by its unfilled
 * slots. Slots vanish when their creator or lane finishes without filling them.
 */
export function tiles(live: Live, removed: Set<string>): LiveTile[] {
  const out: LiveTile[] = [];
  for (const c of live.creators) {
    if (c.status === "pending") out.push({ kind: "slot", key: `c-${c.id}`, label: c.name });
    for (const card of c.cards) {
      if (!live.held.has(card.id) && !removed.has(card.id)) out.push({ kind: "card", card, checking: c.checking });
    }
  }
  if (!live.lanes) {
    if (!live.done) {
      for (let i = 0; i < LANES * live.slotsPerLane; i++) out.push({ kind: "slot", key: `s-${i}`, label: "Finding stories" });
    }
    return out;
  }
  for (const lane of live.lanes) {
    for (const card of lane.cards) if (!removed.has(card.id)) out.push({ kind: "card", card, checking: false });
    if (lane.status === "pending" && !live.done) {
      for (let i = lane.cards.length; i < live.slotsPerLane; i++) {
        out.push({ kind: "slot", key: `${lane.id}-${i}`, label: lane.name, activity: i === lane.cards.length ? lane.activity : undefined });
      }
    }
  }
  return out;
}
