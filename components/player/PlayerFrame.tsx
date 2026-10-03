"use client";

import { useEffect, useRef, useState } from "react";
import { resumePoint } from "@/lib/player/resume";
import { positions, setPosition } from "./positions";

const YOUTUBE = "https://www.youtube.com";
const PLAYING = 1;
const PAUSED = 2;
const ENDED = 0;

/**
 * YouTube's embedded player, started where this window left the video. The
 * embed reports its time over postMessage once it hears "listening" (the
 * protocol YouTube's own iframe API speaks), so no script from YouTube loads.
 */
export function PlayerFrame({ videoId, title }: { videoId: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Set after mount: the saved position is only known in the browser.
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const params = new URLSearchParams({ autoplay: "1", enablejsapi: "1", origin: location.origin });
    const start = positions()[videoId];
    if (start) params.set("start", String(start));
    setSrc(`${YOUTUBE}/embed/${videoId}?${params}`);
  }, [videoId]);

  useEffect(() => {
    if (!src) return;
    let heard = false;
    let state = -1;
    let duration = 0;
    let saved: number | undefined;

    // The embed ignores "listening" until its own script is up, so repeat it until it answers.
    const hello = setInterval(() => {
      if (heard) return clearInterval(hello);
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId, channel: "widget" }), YOUTUBE);
    }, 250);

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YOUTUBE || e.source !== frame.current?.contentWindow) return;
      let info: { currentTime?: number; duration?: number; playerState?: number } | undefined;
      try {
        info = JSON.parse(e.data).info;
      } catch {
        return;
      }
      heard = true;
      if (!info) return;
      if (typeof info.playerState === "number") state = info.playerState;
      if (typeof info.duration === "number") duration = info.duration;
      if (state === ENDED) return setPosition(videoId, (saved = undefined));
      // Times reported before playback starts are 0 and would wipe the saved position.
      if (typeof info.currentTime !== "number" || (state !== PLAYING && state !== PAUSED)) return;
      const point = resumePoint(info.currentTime, duration);
      if (point === saved) return;
      setPosition(videoId, (saved = point));
    };
    window.addEventListener("message", onMessage);
    return () => {
      clearInterval(hello);
      window.removeEventListener("message", onMessage);
    };
  }, [src, videoId]);

  return (
    <iframe
      ref={frame}
      className="player"
      src={src}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}
