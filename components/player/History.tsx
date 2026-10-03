"use client";

import { useEffect, useState } from "react";
import type { PlayerVideo } from "@/lib/player/video";
import { setPosition, stopSaving } from "./positions";

type Entry = { videoId: string; title: string; thumbUrl: string; channel?: string };

/*
  What this window has played, latest arrival first, in sessionStorage: it lives
  exactly as long as the player window and is never saved anywhere else.
*/
const KEY = "player-history";
const CAP = 30;

function remember(video: PlayerVideo): Entry[] {
  const entry: Entry = { videoId: video.videoId, title: video.title, thumbUrl: video.thumbUrl, channel: video.channel };
  try {
    const before = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Entry[];
    // A video already listed keeps its place: the column is navigation, and rows that move under a click are hard to follow.
    const list = before.some((e) => e.videoId === entry.videoId) ? before : [entry, ...before].slice(0, CAP);
    sessionStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    return [entry];
  }
}

/** Take a video out of the list, along with where it was left. */
function forget(videoId: string): Entry[] {
  setPosition(videoId, undefined);
  try {
    const list = (JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Entry[]).filter((e) => e.videoId !== videoId);
    sessionStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

/** The history column beside the video: what this window has played, always showing. A new video joins at the top; replaying one leaves the order alone. */
export function History({ video }: { video: PlayerVideo }) {
  const [list, setList] = useState<Entry[]>([]);
  useEffect(() => setList(remember(video)), [video]);

  const linkTo = (e: Entry) => `/player?${new URLSearchParams({ v: e.videoId, t: e.title })}`;

  function remove(videoId: string) {
    if (videoId !== video.videoId) return setList(forget(videoId));
    // Removing what is playing moves on: the row below, or the top one from the bottom row, or an empty player.
    // replace, so Back does not return to the removed video and list it again.
    const at = list.findIndex((e) => e.videoId === videoId);
    const next = list[at + 1] ?? (at > 0 ? list[0] : undefined);
    stopSaving(videoId);
    forget(videoId);
    location.replace(next ? linkTo(next) : "/player");
  }

  return (
    <ol className="history" aria-label="Played in this window">
      {list.map((e) => (
        <li key={e.videoId}>
          <a
            className={e.videoId === video.videoId ? "current" : undefined}
            href={linkTo(e)}
            aria-current={e.videoId === video.videoId ? "true" : undefined}
          >
            <img src={e.thumbUrl} alt="" loading="lazy" />
            <span className="history-text">
              <span className="history-title">{e.title}</span>
              {e.channel && <span className="history-channel">{e.channel}</span>}
            </span>
          </a>
          <button className="history-remove" type="button" onClick={() => remove(e.videoId)} aria-label={`Remove from history: ${e.title}`} title="Remove">
            ×
          </button>
        </li>
      ))}
    </ol>
  );
}
