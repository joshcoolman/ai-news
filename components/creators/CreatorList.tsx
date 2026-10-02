"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Creator } from "@/lib/store/types";
import type { Card as CardData } from "@/lib/feed/cards";
import type { FeedReach, RecentCard } from "@/lib/creators/recent";
import { FEED_CAP, MAX_DAYS, MIN_DAYS } from "@/lib/creators/window";
import { TopBar } from "../TopBar";
import { Card } from "../feed/Card";
import { AddCreatorForm } from "./AddCreatorForm";

const DAY = 86_400_000;

export function CreatorList({
  initial,
  recent,
  reach,
  days: savedDays,
}: {
  initial: Creator[];
  recent: RecentCard[];
  reach: FeedReach[];
  days: number;
}) {
  const router = useRouter();
  const [creators, setCreators] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [days, setDays] = useState(savedDays);
  const [searching, setSearching] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => setCreators(initial), [initial]);

  async function remove(c: Creator) {
    setCreators((list) => list.filter((x) => x.channelId !== c.channelId));
    if (selected === c.channelId) setSelected(null);
    await fetch(`/api/creators/${c.channelId}`, { method: "DELETE" });
  }

  /** Search the video's topic from home: run it, then go there. Creators stays untouched. */
  async function explore(card: CardData) {
    setSearching((s) => new Set(s).add(card.id));
    setNotes(({ [card.id]: _, ...rest }) => rest);
    let note = "";
    try {
      const res = await fetch("/api/search/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: card.title, channel: card.meta.split(" · ")[0] }),
      });
      const data = await res.json();
      if (res.ok) return router.push(`/?q=${encodeURIComponent(data.query)}${data.added ? "" : "&none=1"}`);
      note = res.status === 409 ? "Refresh running" : "Search failed";
    } catch {
      note = "Search failed";
    }
    setSearching((s) => {
      const next = new Set(s);
      next.delete(card.id);
      return next;
    });
    setNotes((n) => ({ ...n, [card.id]: note }));
  }

  function saveDays() {
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorsWindowDays: days }),
    });
  }

  const cutoff = Date.now() - days * DAY;
  const inWindow = recent.filter((r) => new Date(r.publishedAt).getTime() >= cutoff);
  const shown = inWindow.filter((r) => (selected ? r.channelId === selected : creators.some((c) => c.channelId === r.channelId)));
  const count = (id: string) => inWindow.filter((r) => r.channelId === id).length;
  /** The feed may have been cut off inside the window, so the count is a floor. */
  const capped = (id: string) => {
    const r = reach.find((x) => x.channelId === id);
    return !!r?.full && !!r.oldest && new Date(r.oldest).getTime() > cutoff;
  };

  return (
    <div className="wrap">
      <TopBar current="creators" />
      <h2 className="page-title">Creators</h2>
      <AddCreatorForm onAdded={() => router.refresh()} />
      <label className="window">
        <span>Last {days} days</span>
        <input
          type="range"
          min={MIN_DAYS}
          max={MAX_DAYS}
          step={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          onPointerUp={saveDays}
          onKeyUp={saveDays}
          aria-label="Days of recent videos to show"
        />
      </label>
      <div className="creators-layout">
        <section>
          {shown.length ? (
            <div className="grid">
              {shown.map((r) => (
                <Card key={r.card.id} card={r.card} note={notes[r.card.id]} searching={searching.has(r.card.id)} onMore={() => explore(r.card)} />
              ))}
            </div>
          ) : (
            <p className="empty">Nothing in the last {days} days{selected ? " from this creator" : ""}.</p>
          )}
        </section>
        <aside>
          <ul className="rows">
            {creators.map((c) => (
              <li key={c.channelId} className={`${selected === c.channelId ? "on" : ""}${count(c.channelId) ? "" : " none"}`}>
                <button
                  className="creator-pick"
                  type="button"
                  aria-pressed={selected === c.channelId}
                  onClick={() => setSelected((s) => (s === c.channelId ? null : c.channelId))}
                >
                  {c.avatarUrl ? <img className="avatar" src={c.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
                  <span className="name">{c.name}</span>
                  <span className="count" title={capped(c.channelId) ? `Feed shows only the newest ${FEED_CAP}` : undefined}>
                    {count(c.channelId)}
                    {capped(c.channelId) ? "+" : ""}
                  </span>
                </button>
                {selected === c.channelId && (
                  <div className="row-main">
                    <GuidanceInput creator={c} />
                    <button className="link-btn" type="button" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
                      Delete creator
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {creators.length === 0 && <p className="empty">No creators. Paste a YouTube URL above to add one.</p>}
        </aside>
      </div>
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
