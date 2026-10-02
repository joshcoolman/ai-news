"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Creator } from "@/lib/store/types";
import type { Card as CardData } from "@/lib/feed/cards";
import type { PageTopic } from "@/lib/creators/topics";
import type { FeedReach, RecentCard } from "@/lib/creators/recent";
import { FEED_CAP, MAX_DAYS, MIN_DAYS } from "@/lib/creators/window";
import { TopBar } from "../TopBar";
import { Card } from "../feed/Card";
import { Slot } from "../feed/Slot";
import { handToHome } from "../actions/store";
import { AddCreatorForm } from "./AddCreatorForm";

const DAY = 86_400_000;

/** A stable hue per topic name, so a topic keeps its colour from visit to visit. */
function hueOf(name: string): number {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/*
  The page renders before its videos: they load here, behind placeholders. The
  last result stays in memory for the tab, so moving between pages shows it at
  once; a reload of this page is the ask for fresh feeds.
*/
type Recent = { cards: RecentCard[]; reach: FeedReach[] };
let kept: { key: string; recent: Recent; topics?: PageTopic[] } | null = null;
/** The request under way, shared so a remount (React's dev double-run) does not read every feed twice. */
let inflight: { key: string; recent: Promise<Recent> } | null = null;

function load(key: string): Promise<Recent> {
  if (inflight?.key === key) return inflight.recent;
  const fresh = !kept && reloadedHere();
  const recent = fetch(`/api/creators/recent${fresh ? "?fresh=1" : ""}`).then((res) => (res.ok ? res.json() : Promise.reject()));
  inflight = { key, recent };
  recent.then(
    (r) => (kept = { key, recent: r }),
    () => {},
  ).finally(() => inflight?.recent === recent && (inflight = null));
  return recent;
}

/** Whether this document was loaded by reloading /creators. Only the tab's first fetch acts on it: after that, `kept` is set. */
function reloadedHere(): boolean {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "reload" && new URL(nav.name).pathname === "/creators";
}

const PLACEHOLDERS = 8;

export function CreatorList({ initial, days: savedDays }: { initial: Creator[]; days: number }) {
  const router = useRouter();
  const [creators, setCreators] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const creatorKey = initial.map((c) => c.channelId).sort().join();
  const [recent, setRecent] = useState<Recent | null>(kept?.key === creatorKey ? kept.recent : null);
  const [failed, setFailed] = useState(false);
  const [topics, setTopics] = useState<PageTopic[] | null>(kept?.key === creatorKey ? (kept.topics ?? null) : null);
  const [topic, setTopic] = useState<string | null>(null);
  const [days, setDays] = useState(savedDays);
  useEffect(() => setCreators(initial), [initial]);

  // Videos: from memory when this tab already has them for these creators, otherwise from the server's day cache.
  useEffect(() => {
    if (kept?.key === creatorKey) return;
    let stale = false;
    setFailed(false);
    load(creatorKey)
      .then((d) => {
        if (stale) return;
        setRecent(d);
        setTopics(null);
      })
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [creatorKey]);

  // Topics take a model call the first time, so they arrive after the videos.
  const videoKey = recent?.cards.map((r) => r.card.id).join();
  useEffect(() => {
    if (videoKey === undefined || kept?.topics) return;
    let stale = false;
    fetch("/api/creators/topics")
      .then((res) => (res.ok ? res.json() : { topics: [] }))
      .then((d) => {
        if (stale) return;
        if (kept) kept.topics = d.topics;
        setTopics(d.topics);
      })
      .catch(() => !stale && setTopics([]));
    return () => {
      stale = true;
    };
  }, [videoKey]);

  async function remove(c: Creator) {
    setCreators((list) => list.filter((x) => x.channelId !== c.channelId));
    if (selected === c.channelId) setSelected(null);
    await fetch(`/api/creators/${c.channelId}`, { method: "DELETE" });
  }

  /** Search the video's topic on home: go there now, and home runs it behind placeholders. Creators stays untouched. */
  function explore(card: CardData) {
    handToHome({ title: card.title, channel: card.meta.split(" · ")[0] });
    router.push("/");
  }

  function saveDays() {
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorsWindowDays: days }),
    });
  }

  const cutoff = Date.now() - days * DAY;
  const loading = recent === null;
  const reach = recent?.reach ?? [];
  const inWindow = (recent?.cards ?? []).filter((r) => new Date(r.publishedAt).getTime() >= cutoff);
  const listed = inWindow.filter((r) => creators.some((c) => c.channelId === r.channelId));
  const topicIds = new Set(topics?.find((t) => t.name === topic)?.ids);
  const inTopic = (r: RecentCard) => !topic || topicIds.has(r.card.id);
  const shown = listed.filter((r) => (!selected || r.channelId === selected) && inTopic(r));
  /** Sidebar counts follow the chosen topic; topic badges follow the chosen creator. */
  const count = (id: string) => listed.filter((r) => r.channelId === id && inTopic(r)).length;
  const badges = (topics ?? [])
    .map((t) => {
      const ids = new Set(t.ids);
      const videos = listed.filter((r) => ids.has(r.card.id) && (!selected || r.channelId === selected));
      return { name: t.name, videos: videos.length, creators: new Set(videos.map((r) => r.channelId)).size };
    })
    .filter((b) => b.name === topic || b.videos >= (selected ? 1 : 2))
    .sort((a, b) => b.creators - a.creators || b.videos - a.videos)
    .slice(0, 12);
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
          <p className="status creators-status" aria-live="polite">
            {loading ? (
              <span className="progress">
                <span className="pulse" />
                {failed ? "Could not read creator feeds. Reload to try again." : `Gathering videos from ${creators.length} creators`}
              </span>
            ) : topics === null ? (
              <span className="progress">
                <span className="pulse" />
                {listed.length} videos · grouping topics
              </span>
            ) : (
              `${listed.length} videos from ${new Set(listed.map((r) => r.channelId)).size} creators`
            )}
          </p>
          {topics === null ? (
            <div className="topics" aria-hidden="true">
              {[96, 132, 84, 150, 110].map((w, n) => (
                <span key={n} className="topic-ghost skeleton" style={{ width: w }} />
              ))}
            </div>
          ) : badges.length > 0 && (
            <div className="topics" role="group" aria-label="Topics">
              {badges.map((b) => (
                <button
                  key={b.name}
                  className={`topic${b.creators > 1 ? " multi" : ""}`}
                  style={{ "--h": hueOf(b.name) } as React.CSSProperties}
                  type="button"
                  aria-pressed={topic === b.name}
                  title={b.creators > 1 ? `${b.creators} creators` : undefined}
                  onClick={() => setTopic((t) => (t === b.name ? null : b.name))}
                >
                  {b.name}
                  <span>{b.videos}</span>
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="grid">
              {Array.from({ length: PLACEHOLDERS }, (_, n) => (
                <Slot key={n} label="" />
              ))}
            </div>
          ) : shown.length ? (
            <div className="grid">
              {shown.map((r) => (
                <Card key={r.card.id} card={r.card} onMore={() => explore(r.card)} />
              ))}
            </div>
          ) : (
            <p className="empty">Nothing in the last {days} days{topic ? ` on ${topic}` : ""}{selected ? " from this creator" : ""}.</p>
          )}
        </section>
        <aside>
          <ul className="rows">
            {creators.map((c) => (
              <li key={c.channelId} className={`${selected === c.channelId ? "on" : ""}${loading || count(c.channelId) ? "" : " none"}`}>
                <button
                  className="creator-pick"
                  type="button"
                  aria-pressed={selected === c.channelId}
                  onClick={() => setSelected((s) => (s === c.channelId ? null : c.channelId))}
                >
                  {c.avatarUrl ? <img className="avatar" src={c.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
                  <span className="name">{c.name}</span>
                  {loading ? (
                    <span className="count count-ghost skeleton" />
                  ) : (
                    <span className="count" title={capped(c.channelId) ? `Feed shows only the newest ${FEED_CAP}` : undefined}>
                      {count(c.channelId)}
                      {capped(c.channelId) ? "+" : ""}
                    </span>
                  )}
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
