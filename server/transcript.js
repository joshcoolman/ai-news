import { mutate, read } from "./store.js";
import { cachedVideo } from "./creators/recent.js";
import { paragraphs, parseTimedText } from "./transcript-parse.js";
import { parseChapters } from "./youtube-parse.js";

/*
  A video's transcript, when YouTube already has one (#85). Nothing is made:
  no audio, no speech recognition. Two plain requests, outside the Data API and
  its quota: the player endpoint as YouTube's iOS app asks it, which lists the
  video's caption tracks, and the English track itself, a small timed-text XML.
  The web client's track URLs answer empty without a session token; the iOS
  client's do not (checked October 2026). If every new video starts reading as
  "no transcript", this is the place to look, and the log says so.
*/

const PLAYER = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const CLIENT = { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2", hl: "en" };
const USER_AGENT = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";
/** A video with no track is asked again after this long: captions for a new upload can take hours to appear. */
const MISS_TTL_HOURS = 24;

/** @typedef {{ baseUrl: string, languageCode: string, kind?: string }} Track */

/**
 * The English caption track's text, a creator's own over YouTube's, or undefined when there is none.
 * @param {string} videoId
 */
async function fetchTrack(videoId) {
  const res = await fetch(PLAYER, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    body: JSON.stringify({ context: { client: CLIENT }, videoId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} from YouTube's player endpoint`);
  /** @type {any} */
  const d = await res.json();
  /** @type {Track[] | undefined} */
  const tracks = d?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks) {
    // Unplayable videos legitimately have none; anything else means the shape moved.
    if (d?.playabilityStatus?.status === "OK") console.log(`[transcript] ${videoId}: no caption tracks in a playable response -- has the player response changed shape?`);
    return undefined;
  }
  const english = tracks.filter((t) => t.languageCode === "en" || t.languageCode.startsWith("en-"));
  const track = english.find((t) => t.kind !== "asr") ?? english[0];
  if (!track) return undefined;
  const text = await fetch(track.baseUrl, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  if (!text.ok) throw new Error(`${text.status} from YouTube's caption track`);
  return { xml: await text.text(), kind: track.kind === "asr" ? /** @type {const} */ ("auto") : /** @type {const} */ ("creator") };
}

/**
 * The stored transcript, or one fetched now and stored. Undefined when YouTube
 * has none, remembered for MISS_TTL_HOURS so a play does not ask again.
 * @param {string} videoId
 * @returns {Promise<Transcript | undefined>}
 */
export async function transcript(videoId) {
  const known = (await read()).transcripts[videoId];
  if (known?.paragraphs) return known;
  if (known && Date.now() - Date.parse(known.readAt) < MISS_TTL_HOURS * 3_600_000) return undefined;
  const readAt = new Date().toISOString();
  const track = await fetchTrack(videoId);
  if (!track) {
    await mutate((d) => void (d.transcripts[videoId] = { readAt }));
    console.log(`[transcript] ${videoId}: none`);
    return undefined;
  }
  const fragments = parseTimedText(track.xml);
  // Chapters head the paragraphs: from the cache, else the cached list's description, as the chapters route reads them.
  const cached = await cachedVideo(videoId);
  const chapters = (await read()).cache.chapters[videoId] ?? (cached ? parseChapters(cached.video.description) : []);
  const made = { readAt, kind: track.kind, paragraphs: paragraphs(fragments, chapters) };
  await mutate((d) => void (d.transcripts[videoId] = made));
  console.log(`[transcript] ${videoId}: ${fragments.length} captions (${track.kind}), ${made.paragraphs.length} paragraphs`);
  return made;
}

/**
 * Which of these videos have a transcript stored. Never asks YouTube.
 * @param {string[]} ids
 */
export async function transcribed(ids) {
  const d = await read();
  return ids.filter((id) => d.transcripts[id]?.paragraphs);
}
