import type { Card } from "../feed/cards";

/** Parallel story lanes per refresh, and story slots per lane. */
export const LANES = 4;
export const STORIES_PER_LANE = 2;

/*
  The refresh's event log, streamed to the browser over SSE and replayed in
  full on reconnect. The browser builds its live view from these alone.
*/

export type RefreshEvent =
  | { type: "start"; batch: number; startedAt: string; creators: { id: string; name: string }[] }
  /** A creator's new videos. `checking` while the guidance / avoid filter still has to run. */
  | { type: "videos"; creatorId: string; cards: Card[]; checking: boolean }
  | { type: "creator-failed"; creatorId: string }
  /** The filter ran: these cards were held back (they move to the hidden panel); the rest are confirmed. */
  | { type: "filtered"; heldIds: string[] }
  | { type: "lanes"; lanes: { id: string; name: string; brief: string }[]; slots: number }
  | { type: "activity"; laneId: string; text: string }
  | { type: "stories"; laneId: string; cards: Card[] }
  | { type: "lane-done"; laneId: string; error?: string; cancelled?: boolean }
  | { type: "cost"; usd: number; searches: number }
  | {
      type: "done";
      videos: number;
      stories: number;
      hidden: number;
      failed: string[];
      seconds: number;
      usd: number;
      cancelled: boolean;
      error?: string;
    };
