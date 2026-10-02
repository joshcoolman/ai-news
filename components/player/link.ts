"use client";

import { useEffect, useRef } from "react";

/*
  The player window and the app's pages are one origin, so they talk over a
  BroadcastChannel: the player says what it changed, and open pages update in
  place without a reload.
*/
export type PlayerMessage =
  /** A card's favorite or removal changed. */
  | { type: "card"; id: string }
  /** A creator was added. */
  | { type: "creators" };

const NAME = "ainews-player";

export function announce(msg: PlayerMessage) {
  const ch = new BroadcastChannel(NAME);
  ch.postMessage(msg);
  ch.close();
}

/** Run `handler` for every message the player sends. */
export function usePlayerMessages(handler: (msg: PlayerMessage) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const ch = new BroadcastChannel(NAME);
    ch.onmessage = (e) => latest.current(e.data as PlayerMessage);
    return () => ch.close();
  }, []);
}
