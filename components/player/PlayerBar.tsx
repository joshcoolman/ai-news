"use client";

import { useEffect, useState } from "react";
import type { PlayerVideo } from "@/lib/player/video";
import { History } from "./History";
import { announce } from "./link";

type Creator = { name: string; avatarUrl: string };

/*
  Which removals this window's star made, kept in sessionStorage: it lasts
  while the window is open, across videos, so unstarring only ever restores a
  card its own star removed (an earlier × stays removed).
*/
const KEY = "player-removed";
function starRemoved(id: string): boolean {
  try {
    return (JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}
function setStarRemoved(id: string, on: boolean) {
  try {
    const ids = new Set(JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as string[]);
    if (on) ids.add(id);
    else ids.delete(id);
    sessionStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {}
}

const post = (url: string, payload?: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });

/**
 * The player window's bar: who made it, the title, and a favorite star that
 * follows the "on favorite" setting. No link out to YouTube: loading youtube.com
 * here wipes the window's name, and the next thumbnail opens a second window.
 */
export function PlayerBar({ video }: { video: PlayerVideo }) {
  const [creator, setCreator] = useState<Creator | undefined>(video.creator);
  const [adding, setAdding] = useState(false);
  const [creatorNote, setCreatorNote] = useState("");
  const [favorited, setFavorited] = useState(video.favorited);
  const [asking, setAsking] = useState(false);
  const [removed, setRemoved] = useState(false);
  useEffect(() => setRemoved(starRemoved(video.id)), [video.id]);

  async function remove() {
    setAsking(false);
    setRemoved(true);
    setStarRemoved(video.id, true);
    await post(`/api/items/${encodeURIComponent(video.id)}/remove`);
    announce({ type: "card", id: video.id });
  }

  async function toggleFavorite() {
    if (!favorited) {
      setFavorited(true);
      const res = await post("/api/player/favorite", { videoId: video.videoId });
      if (!res.ok) return setFavorited(false);
      announce({ type: "card", id: video.id });
      // Only a card showing on home can leave it.
      if (!video.inFeed || video.removed) return;
      if (video.onFavorite === "remove") await remove();
      else if (video.onFavorite === "ask") setAsking(true);
      return;
    }
    setFavorited(false);
    setAsking(false);
    await fetch(`/api/favorites/${encodeURIComponent(video.id)}`, { method: "DELETE" });
    if (removed) {
      setRemoved(false);
      setStarRemoved(video.id, false);
      await post(`/api/items/${encodeURIComponent(video.id)}/restore`);
    }
    announce({ type: "card", id: video.id });
  }

  async function addCreator() {
    setAdding(true);
    setCreatorNote("");
    try {
      const res = await post("/api/creators", { url: video.link, guidance: "", grab: true });
      const data = await res.json();
      if (!res.ok) return setCreatorNote(data.error ?? "Could not add");
      setCreator({ name: data.creator.name, avatarUrl: data.creator.avatarUrl });
      setCreatorNote(data.added ? "Added" : "");
      announce({ type: "creators" });
    } catch {
      setCreatorNote("Could not add");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="player-bar">
      <div className="player-creator">
        {creator ? (
          <>
            {creator.avatarUrl ? <img className="avatar" src={creator.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
            <span className="name">{creator.name}</span>
          </>
        ) : video.channel ? (
          <>
            <span className="name">{video.channel}</span>
            <button className="btn" type="button" onClick={addCreator} disabled={adding}>
              {adding ? "Adding" : "Add creator"}
            </button>
          </>
        ) : null}
        {creatorNote && <span className="player-note">{creatorNote}</span>}
      </div>
      <div className="player-title" title={video.title}>
        {video.title}
      </div>
      <div className="player-actions">
        {asking && (
          <button className="link-btn" type="button" onClick={remove}>
            Also remove from Home?
          </button>
        )}
        <button
          className={`icon-btn player-star${favorited ? " on" : ""}`}
          type="button"
          onClick={toggleFavorite}
          aria-pressed={favorited}
          aria-label={favorited ? "Unfavorite" : "Favorite"}
          title={favorited ? (removed ? "Unfavorite and put back on Home" : "Unfavorite") : "Favorite"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill={favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
          </svg>
        </button>
        <History video={video} />
      </div>
    </div>
  );
}
