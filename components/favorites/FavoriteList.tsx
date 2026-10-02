"use client";

import { useState } from "react";
import type { Card as CardData } from "@/lib/feed/cards";
import { TopBar } from "../TopBar";
import { Card } from "../feed/Card";
import { Slot } from "../feed/Slot";
import { usePlayerMessages } from "../player/link";

/** The most cards "more like this" adds, so this many placeholders sit after the card while it searches. */
const MORE_SLOTS = 4;

export function FavoriteList({ initial }: { initial: CardData[] }) {
  const [cards, setCards] = useState(initial);
  const [searching, setSearching] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** Cards the last search added: they animate in where the placeholders were. */
  const [arrived, setArrived] = useState<Set<string>>(new Set());

  // The player window starred or unstarred something.
  usePlayerMessages(async (msg) => {
    if (msg.type !== "card") return;
    const list = await fetch("/api/favorites", { cache: "no-store" });
    if (list.ok) setCards(await list.json());
  });

  async function remove(id: string) {
    setCards((list) => list.filter((c) => c.id !== id));
    await fetch(`/api/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /** "More like this" here adds to Favorites only. */
  async function more(card: CardData) {
    setSearching((s) => new Set(s).add(card.id));
    setNotes(({ [card.id]: _, ...rest }) => rest);
    let note = "";
    try {
      const res = await fetch(`/api/favorites/${encodeURIComponent(card.id)}/more`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) note = "Search failed";
      else if (!data.added) note = data.message ?? "Nothing found";
      const list = await fetch("/api/favorites", { cache: "no-store" });
      if (list.ok) {
        const next: CardData[] = await list.json();
        const had = new Set(cards.map((c) => c.id));
        setArrived(new Set(next.filter((c) => !had.has(c.id)).map((c) => c.id)));
        setCards(next);
      }
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

  return (
    <div className="wrap">
      <TopBar current="favorites" />
      <h2 className="page-title">Favorites</h2>
      {cards.length === 0 ? (
        <p className="empty">No favorites yet. Use the star on a card in the feed.</p>
      ) : (
        <div className="grid">
          {cards.map((card) => [
            <Card
              key={card.id}
              card={card}
              note={notes[card.id]}
              searching={searching.has(card.id)}
              arriving={arrived.has(card.id)}
              onRemove={() => remove(card.id)}
              onMore={() => more(card)}
            />,
            ...(searching.has(card.id) ? Array.from({ length: MORE_SLOTS }, (_, n) => <Slot key={`${card.id}-more-${n}`} label="" />) : []),
          ])}
        </div>
      )}
    </div>
  );
}
