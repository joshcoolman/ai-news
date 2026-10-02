"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Card as CardData, FeedView } from "@/lib/feed/cards";
import type { RefreshEvent } from "@/lib/refresh/events";
import { apply, optimistic, tiles, type Live, type Summary } from "@/lib/refresh/live";
import { TopBar } from "../TopBar";
import { AddCreatorForm } from "../creators/AddCreatorForm";
import { Card } from "./Card";
import { HiddenPanel } from "./HiddenPanel";
import { ProgressLine } from "./ProgressLine";
import { Slot } from "./Slot";
import { SummaryLine } from "./SummaryLine";

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
    await fetch(`/api/items/${encodeURIComponent(card.id)}/remove`, { method: "POST" });
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
        {live ? <ProgressLine live={live} onCancel={cancel} /> : summary ? <SummaryLine s={summary} /> : notice}
      </div>

      {!live && view.hidden.length > 0 && (
        <HiddenPanel hidden={view.hidden} onShow={showAnyway} />
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
    </div>
  );
}
