/*
  Where each video was left, in sessionStorage beside the history: coming back
  to a video in this window picks it up there, and it is all gone when the
  window closes.
*/
const KEY = "player-positions";

export function positions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

// Set once the playing video is removed from History: it keeps reporting its time until the page leaves, and that must not bring its position back.
let leaving = false;

/** Save where a video was left; undefined forgets it. */
export function setPosition(videoId: string, seconds: number | undefined) {
  if (leaving) return;
  try {
    const all = positions();
    if (seconds === undefined) delete all[videoId];
    else all[videoId] = seconds;
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

/** Forget the playing video's position for good; nothing is saved after this until the next page. */
export function stopSaving(videoId: string) {
  setPosition(videoId, undefined);
  leaving = true;
}
