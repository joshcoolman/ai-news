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
