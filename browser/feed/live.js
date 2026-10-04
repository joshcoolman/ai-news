/*
  The browser's view of a refresh in progress, built only from the event log so
  a replay after reload produces exactly the same state. Pure: no DOM, tested
  directly.
*/

/** How many story lanes a refresh plans and how many stories each may find: /api/config's `plan`. */
/** @typedef {{ lanes: number, slots: number }} Plan */
/** @typedef {{ id: string, name: string, status: "pending" | "done" | "failed", cards: Card[], checking: boolean }} LiveCreator */
/** @typedef {{ id: string, name: string, status: "pending" | "done", cards: Card[], activity?: string }} LiveLane */
/** @typedef {Extract<RefreshEvent, { type: "done" }>} Summary */
/**
 * @typedef {{
 *   plan: Plan,
 *   startedAt: number,
 *   creators: LiveCreator[],
 *   lanes: LiveLane[] | null,
 *   slotsPerLane: number,
 *   held: Set<string>,
 *   usd: number,
 *   searches: number,
 *   done?: Summary,
 * }} Live `lanes` is null until the planner names them; placeholder slots show meanwhile.
 */
/**
 * One thing to draw at the front of the grid: a real card, or a slot still waiting.
 * @typedef {{ kind: "card", card: Card, checking: boolean } | { kind: "slot", key: string, label: string, activity?: string }} LiveTile
 */

/**
 * The state drawn the instant Refresh is clicked, before the server answers.
 * @param {{ id: string, name: string }[]} creators
 * @param {Plan} plan
 * @returns {Live}
 */
export function optimistic(creators, plan) {
  return {
    plan,
    startedAt: Date.now(),
    creators: creators.map((c) => ({ ...c, status: "pending", cards: [], checking: false })),
    lanes: null,
    slotsPerLane: plan.slots,
    held: new Set(),
    usd: 0,
    searches: 0,
  };
}

/**
 * @param {Live} live
 * @param {RefreshEvent} e
 * @returns {Live}
 */
export function apply(live, e) {
  switch (e.type) {
    case "start":
      // Replays begin here, so this resets everything.
      return { ...optimistic(e.creators, live.plan), startedAt: new Date(e.startedAt).getTime() };
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

/**
 * @param {LiveLane[] | null} lanes
 * @param {string} id
 * @param {(l: LiveLane) => LiveLane} fn
 */
function mapLane(lanes, id, fn) {
  return lanes && lanes.map((l) => (l.id === id ? fn(l) : l));
}

/**
 * The front of the feed during a refresh: each creator's videos (or a slot
 * while its list loads), then each lane's stories followed by its unfilled
 * slots. Slots vanish when their creator or lane finishes without filling them.
 * @param {Live} live
 * @param {Set<string>} removed
 * @returns {LiveTile[]}
 */
export function tiles(live, removed) {
  /** @type {LiveTile[]} */
  const out = [];
  for (const c of live.creators) {
    if (c.status === "pending") out.push({ kind: "slot", key: `c-${c.id}`, label: c.name });
    for (const card of c.cards) {
      if (!live.held.has(card.id) && !removed.has(card.id)) out.push({ kind: "card", card, checking: c.checking });
    }
  }
  if (!live.lanes) {
    if (!live.done) {
      for (let i = 0; i < live.plan.lanes * live.slotsPerLane; i++) out.push({ kind: "slot", key: `s-${i}`, label: "Finding stories" });
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
