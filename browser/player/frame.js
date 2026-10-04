import { h } from "../shared/dom.js";
import { positions, setPosition } from "./positions.js";
import { resumePoint } from "./resume.js";

const YOUTUBE = "https://www.youtube.com";
const PLAYING = 1;
const PAUSED = 2;
const ENDED = 0;

/**
 * YouTube's embedded player, started where this window left the video. The
 * embed reports its time over postMessage once it hears "listening" (the
 * protocol YouTube's own iframe API speaks), so no script from YouTube loads.
 * @param {string} videoId
 * @param {string} title
 * @param {() => void} onEnded Called once each time the video plays through to its end.
 * @returns {{ frame: HTMLIFrameElement, time: () => number, seek: (seconds: number) => void }}
 *   `time` is where playback is, as last reported; `seek` jumps there.
 */
export function playerFrame(videoId, title, onEnded) {
  const params = new URLSearchParams({ autoplay: "1", enablejsapi: "1", origin: location.origin });
  const start = positions()[videoId];
  if (start) params.set("start", String(start));
  const frame = h("iframe", {
    class: "player",
    src: `${YOUTUBE}/embed/${videoId}?${params}`,
    title,
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
    allowFullscreen: true,
  });

  let heard = false;
  let ended = false;
  let state = -1;
  let time = 0;
  let duration = 0;
  /** @type {number | undefined} */
  let saved;

  // The embed ignores "listening" until its own script is up, so repeat it until it answers.
  const hello = setInterval(() => {
    if (heard) return clearInterval(hello);
    frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId, channel: "widget" }), YOUTUBE);
  }, 250);

  window.addEventListener("message", (e) => {
    if (e.origin !== YOUTUBE || e.source !== frame.contentWindow) return;
    /** @type {{ currentTime?: number, duration?: number, playerState?: number } | undefined} */
    let info;
    try {
      info = JSON.parse(e.data).info;
    } catch {
      return;
    }
    heard = true;
    if (!info) return;
    if (typeof info.playerState === "number") state = info.playerState;
    if (typeof info.duration === "number") duration = info.duration;
    if (state === ENDED) {
      setPosition(videoId, (saved = undefined));
      // The embed reports the end more than once.
      if (!ended) onEnded();
      ended = true;
      return;
    }
    if (state === PLAYING) ended = false;
    // Times reported before playback starts are 0 and would wipe the saved position.
    if (typeof info.currentTime !== "number" || (state !== PLAYING && state !== PAUSED)) return;
    time = info.currentTime;
    const point = resumePoint(info.currentTime, duration);
    if (point === saved) return;
    setPosition(videoId, (saved = point));
  });

  return {
    frame,
    time: () => time,
    seek(seconds) {
      time = seconds;
      frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }), YOUTUBE);
    },
  };
}
