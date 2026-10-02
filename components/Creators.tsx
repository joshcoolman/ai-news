"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Creator } from "@/lib/store/types";
import { TopBar } from "./TopBar";
import { AddCreatorForm } from "./AddCreatorForm";

export function Creators({ initial }: { initial: Creator[] }) {
  const router = useRouter();
  const [creators, setCreators] = useState(initial);
  useEffect(() => setCreators(initial), [initial]);

  async function remove(c: Creator) {
    setCreators((list) => list.filter((x) => x.channelId !== c.channelId));
    await fetch(`/api/creators/${c.channelId}`, { method: "DELETE" });
  }

  return (
    <div className="wrap">
      <TopBar current="creators" />
      <h2 className="page-title">Creators</h2>
      <AddCreatorForm onAdded={() => router.refresh()} />
      <ul className="rows">
        {creators.map((c) => (
          <li key={c.channelId}>
            {c.avatarUrl ? <img className="avatar" src={c.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
            <div className="row-main">
              <a className="name" href={c.channelUrl} target="_blank" rel="noopener">
                {c.name}
              </a>
              <GuidanceInput creator={c} />
            </div>
            <button className="btn small" type="button" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {creators.length === 0 && <p className="empty">No creators. Paste a YouTube URL above to add one.</p>}
    </div>
  );
}

/** Guidance edited in place; saved on Enter or when focus leaves. */
function GuidanceInput({ creator }: { creator: Creator }) {
  const [value, setValue] = useState(creator.guidance);
  const [saved, setSaved] = useState(creator.guidance);

  async function save() {
    if (value.trim() === saved) return;
    const res = await fetch(`/api/creators/${creator.channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guidance: value }),
    });
    if (res.ok) setSaved(value.trim());
  }

  return (
    <input
      className="guidance-input"
      value={value}
      placeholder="No guidance: every new video. Click to add some."
      aria-label={`Guidance for ${creator.name}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(saved);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
