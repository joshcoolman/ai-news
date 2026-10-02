"use client";

import { useEffect, useState } from "react";
import type { PlayerVideo } from "@/lib/player/video";

type Entry = { videoId: string; title: string; thumbUrl: string; channel?: string };

/*
  What this window has played, newest first, in sessionStorage: it lives
  exactly as long as the player window and is never saved anywhere else.
*/
const KEY = "player-history";
const CAP = 30;

function remember(video: PlayerVideo): Entry[] {
  const entry: Entry = { videoId: video.videoId, title: video.title, thumbUrl: video.thumbUrl, channel: video.channel };
  try {
    const before = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Entry[];
    const list = [entry, ...before.filter((e) => e.videoId !== entry.videoId)].slice(0, CAP);
    sessionStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    return [entry];
  }
}

/** The history button (shown once the window has played more than one video) and the list it slides up. */
export function History({ video }: { video: PlayerVideo }) {
  const [list, setList] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => setList(remember(video)), [video]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (list.length < 2) return null;
  return (
    <>
      <button
        className={`icon-btn${open ? " on" : ""}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="History"
        title="History"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v4h4" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      {open && (
        <ol className="history" aria-label="Played in this window">
          {list.map((e) => (
            <li key={e.videoId}>
              <a
                className={e.videoId === video.videoId ? "current" : undefined}
                href={`/player?${new URLSearchParams({ v: e.videoId, t: e.title })}`}
                aria-current={e.videoId === video.videoId ? "true" : undefined}
              >
                <img src={e.thumbUrl} alt="" loading="lazy" />
                <span className="history-text">
                  <span className="history-title">{e.title}</span>
                  {e.channel && <span className="history-channel">{e.channel}</span>}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
