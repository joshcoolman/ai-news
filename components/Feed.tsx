"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Card as CardData, FeedView } from "@/lib/view";
import type { RefreshEvent } from "@/lib/refresh-events";
import { apply, optimistic, tiles, type Live, type Summary } from "@/lib/live";
import { TopBar } from "./TopBar";
import { AddCreatorForm } from "./AddCreatorForm";

type Initial = FeedView & { refresh: { running: boolean } };
type CreatorRef = { id: string; name: string };

export function Feed({ initial, creators }: { initial: Initial; creators: CreatorRef[] }) {
  const [view, setView] = useState<FeedView>(initial);
  const [live, setLive] = useState<Live | null>(initial.refresh.running ? optimistic(creators) : null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [why, setWhy] = useState<{ id: string; title: string } | null>(null);
  const source = useRef<EventSource | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/feed", { cache: "no-store" });
    if (res.ok) setView(await res.json());
  }, []);

  /** Follow the running refresh. The server replays its whole log first, so this also re-attaches after a reload. */
  const follow = useCallback(() => {
    source.current?.close();
    const es = new EventSource("/api/refresh/events");
    source.current = es;
    es.onmessage = async (msg) => {
      const e = JSON.parse(msg.data) as RefreshEvent | { type: "idle" };
      if (e.type === "idle") {
        es.close();
        await reload();
        setLive(null);
        return;
      }
      setLive((l) => apply(l ?? optimistic([]), e));
      if (e.type === "done") {
        es.close();
        await reload();
        setLive(null);
        setSummary(e);
      }
    };
  }, [reload]);

  useEffect(() => {
    if (initial.refresh.running) follow();
    return () => source.current?.close();
  }, [initial.refresh.running, follow]);

  async function refresh() {
    // Placeholders go up before the request leaves.
    setLive(optimistic(creators));
    setSummary(null);
    setNotice("");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      if (!res.ok && res.status !== 409) throw new Error();
    } catch {
      setLive(null);
      setNotice("Refresh failed to start. Is the dev server running?");
      return;
    }
    follow();
  }

  async function cancel() {
    await fetch("/api/refresh/cancel", { method: "POST" });
  }

  async function remove(card: CardData) {
    setRemoved((s) => new Set(s).add(card.id));
    setWhy({ id: card.id, title: card.title });
    await fetch(`/api/items/${encodeURIComponent(card.id)}/remove`, { method: "POST" });
  }

  async function saveReason(id: string, reason: string) {
    setWhy(null);
    if (!reason.trim()) return;
    await fetch(`/api/items/${encodeURIComponent(id)}/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  }

  async function more(card: CardData) {
    setSearching((s) => new Set(s).add(card.id));
    setNotes(({ [card.id]: _, ...rest }) => rest);
    let note = "";
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(card.id)}/more`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) note = "Search failed";
      else if (!data.added) note = data.message ?? "Nothing found";
      await reload();
    } catch {
      note = "Search failed";
    }
    setSearching((s) => {
      const next = new Set(s);
      next.delete(card.id);
      return next;
    });
    if (note) setNotes((n) => ({ ...n, [card.id]: note }));
  }

  async function showAnyway(id: string) {
    await fetch(`/api/items/${encodeURIComponent(id)}/show`, { method: "POST" });
    await reload();
  }

  const front = live ? tiles(live, removed) : [];
  const frontIds = new Set(front.flatMap((t) => (t.kind === "card" ? [t.card.id] : [])));
  // While a refresh runs, the cards arriving at the front are the new ones.
  const rest = view.cards
    .filter((c) => !frontIds.has(c.id) && !removed.has(c.id))
    .map((c) => (live ? { ...c, isNew: false } : c));
  const cardProps = (card: CardData) => ({
    card,
    note: notes[card.id],
    searching: searching.has(card.id),
    onRemove: () => remove(card),
    onMore: () => more(card),
  });

  return (
    <div className="wrap">
      <TopBar>
        <button className="btn primary" type="button" onClick={refresh} disabled={!!live}>
          {live ? "Refreshing" : "Refresh"}
        </button>
        <button className="btn" type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          Add creator
        </button>
      </TopBar>

      {adding && <AddCreatorForm autoFocus />}

      <div className="status" role="status">
        {live ? <Progress live={live} onCancel={cancel} /> : summary ? <SummaryLine s={summary} /> : notice}
      </div>

      {!live && view.hidden.length > 0 && (
        <details className="hidden-panel">
          <summary>{view.hidden.length} hidden</summary>
          <ul>
            {view.hidden.map((h) => (
              <li key={h.id}>
                <span>{h.title}</span>
                <span className="why">
                  {h.channel} · {h.why}
                </span>
                <button className="link-btn" type="button" onClick={() => showAnyway(h.id)}>
                  Show anyway
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {front.length === 0 && rest.length === 0 ? (
        <p className="empty">Nothing here yet. Press Refresh to fetch the latest from your creators and the web.</p>
      ) : (
        <div className="grid">
          {front.map((t) =>
            t.kind === "slot" ? (
              <Slot key={t.key} label={t.label} activity={t.activity} />
            ) : (
              <Card key={t.card.id} {...cardProps(t.card)} checking={t.checking} arriving />
            ),
          )}
          {rest.map((card) => (
            <Card key={card.id} {...cardProps(card)} />
          ))}
        </div>
      )}

      {why && <WhyBox key={why.id} title={why.title} onDone={(reason) => saveReason(why.id, reason)} />}
    </div>
  );
}

function Progress({ live, onCancel }: { live: Live; onCancel: () => void }) {
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

function SummaryLine({ s }: { s: Summary }) {
  const added = [s.videos && plural(s.videos, "video"), s.stories && plural(s.stories, "story", "stories")].filter(Boolean);
  const head = added.length ? `Added ${added.join(" and ")}` : "Nothing new since the last refresh";
  const tail = [
    s.cancelled && "stopped early",
    s.hidden && `${s.hidden} hidden`,
    s.failed.length && `could not fetch ${s.failed.join(", ")}`,
    s.error && "something failed; see the server log",
  ].filter(Boolean);
  return (
    <>
      <b>{head}.</b> {clock(s.seconds)} · ${s.usd.toFixed(2)}
      {tail.length > 0 && ` · ${tail.join(" · ")}`}
    </>
  );
}

function Slot({ label, activity }: { label: string; activity?: string }) {
  return (
    <div className="card slot" aria-busy="true">
      <div className="thumb skeleton">
        <span className="slot-label">{label}</span>
      </div>
      <div className="skeleton-line" />
      <div className="meta slot-activity">{activity ?? " "}</div>
    </div>
  );
}

function Card({
  card,
  note,
  searching,
  checking,
  arriving,
  onRemove,
  onMore,
}: {
  card: CardData;
  note?: string;
  searching: boolean;
  checking?: boolean;
  arriving?: boolean;
  onRemove: () => void;
  onMore: () => void;
}) {
  return (
    <div className={`card${arriving ? " arrive" : ""}${checking ? " checking" : ""}`}>
      <div className="thumb" style={{ "--h": hue(card.id) } as React.CSSProperties}>
        {card.thumbUrl ? <img src={card.thumbUrl} alt="" loading="lazy" /> : <span>{card.label}</span>}
        <a className="hit" href={card.link} target="_blank" rel="noopener" aria-label={`Open: ${card.title}`} />
        {card.isNew && <span className="new-tag">New</span>}
        {checking ? (
          <span className="card-note checking-note">Checking guidance</span>
        ) : (
          <>
            <button className="remove" type="button" onClick={onRemove} aria-label={`Remove: ${card.title}`} title="Remove">
              &times;
            </button>
            <button
              className="more"
              type="button"
              onClick={onMore}
              disabled={searching}
              aria-label={`More like this: ${card.title}`}
              title="More like this"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M15.5 15.5 21 21" />
              </svg>
            </button>
            {(searching || note) && <span className="card-note">{searching ? "Searching" : note}</span>}
          </>
        )}
        {card.duration && <span className="badge">{card.duration}</span>}
      </div>
      <div className="title">
        <a href={card.link} target="_blank" rel="noopener">
          {card.title}
        </a>
      </div>
      <div className="meta">{card.meta}</div>
    </div>
  );
}

/** After a removal: Enter saves a reason to the avoid list; Escape or clicking away removes just this one. */
function WhyBox({ title, onDone }: { title: string; onDone: (reason: string) => void }) {
  const [text, setText] = useState("");
  const done = useRef(false);
  const finish = (reason: string) => {
    if (done.current) return;
    done.current = true;
    onDone(reason);
  };
  return (
    <div className="why-box">
      <label htmlFor="why">
        Removed <b>{title}</b>. Why?
      </label>
      <input
        id="why"
        className="field"
        autoFocus
        value={text}
        placeholder="e.g. not interested in benchmarks"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(text);
          if (e.key === "Escape") finish("");
        }}
        onBlur={() => finish("")}
      />
      <span className="hint">Enter saves it to the avoid list. Escape skips: just this one.</span>
    </div>
  );
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function hue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
