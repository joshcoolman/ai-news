"use client";

import { useEffect, useState } from "react";
import type { Live } from "@/lib/refresh/live";
import { clock } from "./format";

/** The live status line during a refresh, ticking once a second. */
export function ProgressLine({ live, onCancel }: { live: Live; onCancel: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const creatorsDone = live.creators.filter((c) => c.status !== "pending").length;
  const lanesDone = live.lanes?.filter((l) => l.status === "done").length ?? 0;
  const parts = [
    creatorsDone < live.creators.length ? `Creators ${creatorsDone} of ${live.creators.length}` : "Creators done",
    live.lanes ? `Stories: ${lanesDone} of ${live.lanes.length} searches done` : "Planning story searches",
    clock((Date.now() - live.startedAt) / 1000),
    `$${live.usd.toFixed(2)}`,
  ];
  return (
    <span className="progress">
      <span className="pulse" aria-hidden="true" />
      {parts.join(" · ")}
      {live.lanes && lanesDone < live.lanes.length && (
        <button className="link-btn" type="button" onClick={onCancel}>
          Stop searching
        </button>
      )}
    </span>
  );
}
