"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Card as CardData, FeedView } from "@/lib/feed/cards";
import type { RefreshEvent } from "@/lib/refresh/events";
import type { Settings } from "@/lib/store/types";
import { apply, optimistic, tiles, type Live, type Summary } from "@/lib/refresh/live";
import { TopBar } from "../TopBar";
import { FEED_CHANGED_EVENT, REFRESH_EVENT, SEARCH_EVENT, setRefreshing, takeHandoff, type VideoSearch } from "../actions/store";
import { usePlayerMessages } from "../player/link";
import { Card } from "./Card";
import { FavoritePrompt } from "./FavoritePrompt";
import { ProgressLine } from "./ProgressLine";
import { Slot } from "./Slot";
import { SummaryLine } from "./SummaryLine";

type Initial = FeedView & { refresh: { running: boolean } };
type CreatorRef = { id: string; name: string };

/** The most cards a search (top) or "more like this" (after its card) adds, so this many placeholders hold their place. */
const SEARCH_SLOTS = 8;
const MORE_SLOTS = 4;

export function Feed({
  initial,
  creators,
  settings,
}: {
  initial: Initial;
  creators: CreatorRef[];
  settings: Settings;
}) {
  const [view, setView] = useState<FeedView>(initial);
  const [live, setLive] = useState<Live | null>(initial.refresh.running ? optimistic(creators) : null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notice, setNotice] = useState("");
  /** What a running search is doing; while set, placeholders sit where its cards will land. */
  const [pending, setPending] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [faved, setFaved] = useState<Set<string>>(new Set());
  /** Cards the last search added: they animate in where the placeholders were. */
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const [onFavorite, setOnFavorite] = useState(settings.onFavorite);
  const [asking, setAsking] = useState<CardData | null>(null);
  const source = useRef<EventSource | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/feed", { cache: "no-store" });
    if (res.ok) setView(await res.json());
  }, []);

  /** Reload after a search, marking the cards it added so they animate in. */
  const ids = useRef(new Set<string>());
  ids.current = new Set(view.cards.map((c) => c.id));
  async function reloadArriving() {
    const before = ids.current;
    const res = await fetch("/api/feed", { cache: "no-store" });
    if (!res.ok) return;
    const next: FeedView = await res.json();
    setArrived(new Set(next.cards.filter((c) => !before.has(c.id)).map((c) => c.id)));
    setView(next);
  }

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

  async function favorite(card: CardData) {
    setFaved((s) => new Set(s).add(card.id));
    const res = await fetch(`/api/items/${encodeURIComponent(card.id)}/favorite`, { method: "POST" });
    if (!res.ok) {
      setFaved((s) => {
        const next = new Set(s);
        next.delete(card.id);
        return next;
      });
      return;
    }
    if (onFavorite === "remove") await remove(card);
    else if (onFavorite === "ask") setAsking(card);
  }

  async function answerPrompt(card: CardData, removeFromHome: boolean, dontAsk: boolean) {
    setAsking(null);
    if (removeFromHome) await remove(card);
    if (dontAsk) {
      const next = removeFromHome ? "remove" : "keep";
      setOnFavorite(next);
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onFavorite: next }),
      });
    }
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
      await reloadArriving();
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

  /** Runs a search behind placeholders: `run` returns the notice to show (empty when cards were added). */
  async function runSearch(what: string, run: () => Promise<string>) {
    setSummary(null);
    setNotice("");
    setPending(what);
    let note: string;
    try {
      note = await run();
      await reloadArriving();
    } catch {
      note = "Search failed";
    }
    setPending(null);
    setNotice(note);
  }

  async function post(url: string, payload: unknown): Promise<string> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (res.status === 409) return "A refresh is running. Search again when it finishes.";
    if (!res.ok) return data.error ?? "Search failed";
    return data.added ? "" : (data.message ?? "Nothing found");
  }

  const search = (query: string) => runSearch(`Searching for ${query}`, () => post("/api/search", { query }));
  const searchVideo = (v: VideoSearch) => runSearch(`Finding more on: ${v.title}`, () => post("/api/search/video", v));

  // The player window favorited, removed or restored a card, or added a creator (whose videos land here).
  usePlayerMessages((msg) => {
    if (msg.type === "card")
      setFaved((s) => {
        const next = new Set(s);
        next.delete(msg.id);
        return next;
      });
    void reload();
  });

  // Work handed over by another page: home is already up, so run it here.
  useEffect(() => {
    const task = takeHandoff();
    if (task?.kind === "refresh") void refresh();
    else if (task?.kind === "search") void search(task.query);
    else if (task?.kind === "video") void searchVideo(task);
  }, []);

  // The header's buttons hand their work to the feed when you are on home.
  const latest = useRef({ refresh, search });
  latest.current = { refresh, search };
  useEffect(() => setRefreshing(!!live), [live]);
  useEffect(() => {
    const onRefresh = () => void latest.current.refresh();
    const onSearch = (e: Event) => void latest.current.search((e as CustomEvent<{ query: string }>).detail.query);
    const onChanged = async (e: Event) => {
      setSummary(null);
      setNotice((e as CustomEvent<{ notice?: string }>).detail?.notice ?? "");
      await reload();
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    window.addEventListener(SEARCH_EVENT, onSearch);
    window.addEventListener(FEED_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(REFRESH_EVENT, onRefresh);
      window.removeEventListener(SEARCH_EVENT, onSearch);
      window.removeEventListener(FEED_CHANGED_EVENT, onChanged);
    };
  }, [reload]);

  const front = live ? tiles(live, removed) : [];
  const frontIds = new Set(front.flatMap((t) => (t.kind === "card" ? [t.card.id] : [])));
  // While a refresh runs, the cards arriving at the front are the new ones.
  const rest = view.cards
    .filter((c) => !frontIds.has(c.id) && !removed.has(c.id))
    .map((c) => (live ? { ...c, isNew: false } : c));
  const cardProps = (card: CardData) => ({
    card: faved.has(card.id) ? { ...card, favorited: true } : card,
    note: notes[card.id],
    searching: searching.has(card.id),
    onRemove: () => remove(card),
    onMore: () => more(card),
    onFavorite: () => favorite(card),
  });

  return (
    <div className="wrap">
      <TopBar />


      <div className="status" role="status">
        {live ? (
          <ProgressLine live={live} onCancel={cancel} />
        ) : pending ? (
          <span className="progress">
            <span className="pulse" />
            {pending}
          </span>
        ) : summary ? (
          <SummaryLine s={summary} />
        ) : (
          notice
        )}
      </div>

      {front.length === 0 && rest.length === 0 && !pending ? (
        <p className="empty">Nothing here yet. Press Refresh to fetch the latest from your creators and the web.</p>
      ) : (
        <div className="grid">
          {pending && !live && Array.from({ length: SEARCH_SLOTS }, (_, n) => <Slot key={`search-${n}`} label="" />)}
          {front.map((t) =>
            t.kind === "slot" ? (
              <Slot key={t.key} label={t.label} activity={t.activity} />
            ) : (
              <Card key={t.card.id} {...cardProps(t.card)} checking={t.checking} arriving />
            ),
          )}
          {rest.map((card) => [
            <Card key={card.id} {...cardProps(card)} arriving={arrived.has(card.id)} />,
            ...(searching.has(card.id) ? Array.from({ length: MORE_SLOTS }, (_, n) => <Slot key={`${card.id}-more-${n}`} label="" />) : []),
          ])}
        </div>
      )}

      {asking && <FavoritePrompt key={asking.id} title={asking.label ?? asking.title} onDone={(r, d) => answerPrompt(asking, r, d)} />}
    </div>
  );
}
