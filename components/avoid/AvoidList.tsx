"use client";

import { useState } from "react";
import type { AvoidEntry } from "@/lib/store/types";
import { TopBar } from "../TopBar";

export function AvoidList({ initial }: { initial: AvoidEntry[] }) {
  const [entries, setEntries] = useState(initial);

  async function remove(id: string) {
    setEntries((list) => list.filter((e) => e.id !== id));
    await fetch(`/api/avoid/${id}`, { method: "DELETE" });
  }

  return (
    <div className="wrap">
      <TopBar current="avoid" />
      <h2 className="page-title">Avoid</h2>
      <p className="status">
        Reasons you gave when removing a card. Each one is passed to the model word for word on every refresh. Deleting one stops it applying from the next refresh; it does not bring back what it already hid.
      </p>
      {entries.length === 0 ? (
        <p className="empty">Nothing on the avoid list.</p>
      ) : (
        <ul className="rows">
          {entries.map((e) => (
            <li key={e.id}>
              <div className="row-main">
                <span className="name">{e.reason}</span>
                <span className="sub">From: {e.fromTitle}</span>
              </div>
              <button className="btn small" type="button" onClick={() => remove(e.id)} aria-label={`Delete: ${e.reason}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
