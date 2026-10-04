import "server-only";
export type ParsedYouTubeUrl =
  | { kind: "video"; videoId: string; url: string }
  | { kind: "handle"; handle: string }
  | { kind: "channel"; channelId: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE = /^@[A-Za-z0-9._-]{1,100}$/;

/** Classify a pasted YouTube URL. Returns null for anything that is not one of the supported shapes. */
export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0];
    return id && VIDEO_ID.test(id) ? video(id) : null;
  }
  if (host !== "youtube.com") return null;

  if (parts[0] === "watch") {
    const id = url.searchParams.get("v");
    return id && VIDEO_ID.test(id) ? video(id) : null;
  }
  if (parts[0] === "shorts" || parts[0] === "live") {
    const id = parts[1];
    return id && VIDEO_ID.test(id) ? video(id) : null;
  }
  if (parts[0] === "channel") {
    const id = parts[1];
    return id && CHANNEL_ID.test(id) ? { kind: "channel", channelId: id } : null;
  }
  if (parts[0] && HANDLE.test(decodeURIComponent(parts[0]))) {
    return { kind: "handle", handle: decodeURIComponent(parts[0]) };
  }
  return null;
}

function video(videoId: string): ParsedYouTubeUrl {
  return { kind: "video", videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

/** Seconds in an ISO 8601 duration ("PT1H2M3S"), or undefined for none, zero (a live stream) or anything unreadable. */
export function isoDurationSeconds(iso: string | undefined): number | undefined {
  const m = iso?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return undefined;
  const [d, h, min, s] = m.slice(1).map((n) => Number(n ?? 0));
  return d * 86_400 + h * 3600 + min * 60 + s || undefined;
}

/** "3 days ago" for a publish time. */
export function ageText(publishedAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(publishedAt)) / 60_000));
  const [n, unit] =
    minutes < 60 ? [minutes, "minute"] :
    minutes < 1440 ? [Math.floor(minutes / 60), "hour"] :
    minutes < 43_200 ? [Math.floor(minutes / 1440), "day"] :
    minutes < 525_600 ? [Math.floor(minutes / 43_200), "month"] :
    [Math.floor(minutes / 525_600), "year"];
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
