"use client";

import { useState } from "react";
import type { Settings } from "@/lib/store/types";
import { TopBar } from "../TopBar";

const ON_FAVORITE: { value: Settings["onFavorite"]; label: string }[] = [
  { value: "ask", label: "Ask each time" },
  { value: "remove", label: "Delete from home" },
  { value: "keep", label: "Keep on home" },
];

export function SettingsForm({ initial }: { initial: Settings }) {
  const [onFavorite, setOnFavorite] = useState(initial.onFavorite);

  async function save(value: Settings["onFavorite"]) {
    setOnFavorite(value);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onFavorite: value }),
    });
  }

  return (
    <div className="wrap">
      <TopBar current="settings" />
      <h2 className="page-title">Settings</h2>
      <fieldset className="setting">
        <legend>When I favorite a card</legend>
        {ON_FAVORITE.map((o) => (
          <label key={o.value} className="check">
            <input type="radio" name="onFavorite" value={o.value} checked={onFavorite === o.value} onChange={() => save(o.value)} />
            {o.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
