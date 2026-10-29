import { keySources, MissingKeyError } from "./server/keys.js";
import { mutate, read } from "./server/store.js";
import { favoriteCards, hasChapters } from "./server/cards.js";
import { keyWorks, resolveCreator, UserInputError, videoChapters } from "./server/youtube.js";
import { cachedVideo, recentVideos } from "./server/creators/recent.js";
import { creatorsWithLinks } from "./server/creators/links.js";
import { parseChapters } from "./server/youtube-parse.js";
import { clampDays, FEED_CAP, MAX_DAYS, MIN_DAYS } from "./server/creators/window.js";
import { favoriteVideo, playerVideo } from "./server/player.js";
import { transcribed, transcript } from "./server/transcript.js";

/*
  Every URL the app answers, in one place. Pages are files in browser/; an API
  route is a method, a path (`:id` is a parameter) and the handler below it.
  Handlers stay thin: read the request, call into server/, shape the reply.
*/

/** @type {Record<string, string>} */
export const pages = {
  "/": "app.html",
  "/creators": "creators.html",
  "/favorites": "favorites.html",
  "/settings": "settings.html",
  "/player": "player.html",
};

/** @type {[method: string, path: string, handler: (ctx: Ctx) => Reply | void | Promise<Reply | void>][]} */
export const routes = [
  ["GET", "/api/config", config],
  ["POST", "/api/keys/check", checkKeys],

  ["GET", "/api/favorites", favorites],
  ["DELETE", "/api/favorites/:id", deleteFavorite],

  ["GET", "/api/creators", creators],
  ["POST", "/api/creators", addCreator],
  ["POST", "/api/creators/resolve", lookUpCreator],
  ["GET", "/api/creators/recent", creatorsRecent],
  ["DELETE", "/api/creators/:id", deleteCreator],

  ["GET", "/api/settings", settings],
  ["PATCH", "/api/settings", editSettings],

  ["GET", "/api/player/video", playerInfo],
  ["GET", "/api/player/chapters", playerChapters],
  ["GET", "/api/player/marks", playerMarks],
  ["GET", "/api/player/transcript", playerTranscript],
  ["POST", "/api/player/favorite", playerFavorite],
];

/**
 * @param {unknown} body
 * @returns {Reply}
 */
const json = (body, status = 200) => ({ status, body });
/**
 * @param {string} error
 * @param {number} status
 * @returns {Reply}
 */
const fail = (error, status) => ({ status, body: { error } });

/**
 * Run `fn`; if it throws, log it and answer with `message`. A missing key is
 * left to the server, which answers 401 so the page can ask for it.
 * @param {string} message
 * @param {number} status
 * @param {() => Promise<Reply>} fn
 */
async function orFail(message, status, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MissingKeyError) throw err;
    console.error(err);
    return fail(message, status);
  }
}

/**
 * What every page reads first: where the key comes from (so it knows whether
 * to ask for it), and the numbers the pages must agree with the server on.
 */
function config() {
  return json({
    keys: keySources(),
    days: { min: MIN_DAYS, max: MAX_DAYS },
    feedCap: FEED_CAP,
  });
}

/** Whether the key this request carries is accepted, checked before the browser saves it. */
async function checkKeys() {
  return json({ youtube: await keyWorks() });
}

/* Favorites */

async function favorites() {
  return json(favoriteCards(await read()));
}

/** @param {Ctx} ctx */
async function deleteFavorite({ params }) {
  await mutate((d) => {
    d.favorites = d.favorites.filter((f) => f.item.id !== params.id);
  });
  return json({ ok: true });
}

/* Creators */

/** The saved creators; a creator whose About page was never read for an X link has it read first (#91). */
async function creators() {
  return json(await creatorsWithLinks());
}

/**
 * A creator from a pasted URL, or the reply that says why not.
 * @param {unknown} url
 * @returns {Promise<ChannelInfo | Reply>}
 */
async function creatorFrom(url) {
  if (typeof url !== "string" || !url.trim()) return fail("Paste a YouTube video or channel URL.", 400);
  try {
    return await resolveCreator(url);
  } catch (err) {
    if (err instanceof UserInputError) return fail(err.message, 400);
    if (err instanceof MissingKeyError) throw err;
    console.error(err);
    return fail("Could not read that channel from YouTube.", 502);
  }
}

/** @param {Ctx} ctx */
async function addCreator({ body }) {
  const info = await creatorFrom(body.url);
  if ("status" in info) return info;
  const added = await mutate((d) => {
    if (d.creators.some((c) => c.channelId === info.channelId)) return false;
    d.creators.push(info);
    return true;
  });
  return json({ added, creator: info });
}

/** Look up what a pasted URL points at, without adding anything. Feeds the "Found ..." line in the Add creator popup. */
/** @param {Ctx} ctx */
async function lookUpCreator({ body }) {
  const creator = await creatorFrom(body.url);
  if ("status" in creator) return creator;
  const listed = (await read()).creators.some((c) => c.channelId === creator.channelId);
  return json({ creator, listed });
}

/** The Creators page's videos, from lists read at most twice a day; `fresh=1` (the status line's refresh) reads them all now. */
/** @param {Ctx} ctx */
function creatorsRecent({ query }) {
  const force = query.get("fresh") === "1";
  return orFail("Could not read creator feeds.", 500, async () => json(await recentVideos((await read()).creators, force)));
}

/** Stops future fetches. The cached list stays until it ages out. */
/** @param {Ctx} ctx */
async function deleteCreator({ params }) {
  await mutate((d) => {
    d.creators = d.creators.filter((c) => c.channelId !== params.id);
  });
  return json({ ok: true });
}

/* Settings */

async function settings() {
  return json((await read()).settings);
}

/** Change any of the settings sent; the rest stay as they are. */
/** @param {Ctx} ctx */
async function editSettings({ body }) {
  const { creatorsWindowDays, skipMembersOnly } = body;
  if (skipMembersOnly !== undefined && typeof skipMembersOnly !== "boolean") return fail("skipMembersOnly must be true or false.", 400);
  if (creatorsWindowDays === undefined && skipMembersOnly === undefined) return fail("Nothing to change.", 400);
  return json(
    await mutate((d) => {
      if (creatorsWindowDays !== undefined) d.settings.creatorsWindowDays = clampDays(creatorsWindowDays);
      if (skipMembersOnly !== undefined) d.settings.skipMembersOnly = skipMembersOnly;
      return d.settings;
    }),
  );
}

/* Player */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The video the player window is playing, as the app knows it: `?v=<video id>`, and `&t=<title>` for one found nowhere. */
/** @param {Ctx} ctx */
async function playerInfo({ query }) {
  const v = query.get("v") ?? "";
  if (!VIDEO_ID.test(v)) return fail("Missing video id.", 400);
  return json(await playerVideo(v, query.get("t") ?? ""));
}

/**
 * The chapters of the video playing, for the chapter keys: `?v=<video id>`.
 * None is an empty list, and so is a failed lookup. Cached for good once read: chapters never change.
 * @param {Ctx} ctx
 */
async function playerChapters({ query }) {
  const v = query.get("v") ?? "";
  if (!VIDEO_ID.test(v)) return fail("Missing video id.", 400);
  const known = (await read()).cache.chapters[v];
  if (known) return json({ chapters: known });
  // The cached channel lists carry full descriptions: a listed video's chapters cost no unit.
  const cached = await cachedVideo(v);
  if (cached) return json({ chapters: parseChapters(cached.video.description) });
  return orFail("Could not read chapters.", 502, async () => {
    const chapters = await videoChapters(v);
    await mutate((d) => void (d.cache.chapters[v] = chapters));
    return json({ chapters });
  });
}

/**
 * Which of these videos (`?v=<id>,<id>,...`) list chapters, and which have a transcript stored, for
 * History rows saved before either mark. Cached descriptions, favorites and stored transcripts only:
 * this never asks YouTube, so an unlisted video is simply not named.
 * @param {Ctx} ctx
 */
async function playerMarks({ query }) {
  const ids = (query.get("v") ?? "").split(",").filter((v) => VIDEO_ID.test(v)).slice(0, 500);
  const d = await read();
  const chaptered = [];
  for (const id of ids) {
    const stored = d.favorites.find((f) => f.item.videoId === id)?.item;
    if (stored?.chapters || hasChapters((await cachedVideo(id))?.video.description)) chaptered.push(id);
  }
  return json({ chaptered, transcribed: await transcribed(ids) });
}

/**
 * The transcript of a video (`?v=<video id>`), fetched from YouTube and stored the first time it is asked for (#85).
 * `{ paragraphs: undefined }` when YouTube has none; a failed ask is a 502 and is asked again next time.
 * @param {Ctx} ctx
 */
async function playerTranscript({ query }) {
  const v = query.get("v") ?? "";
  if (!VIDEO_ID.test(v)) return fail("Missing video id.", 400);
  return orFail("Could not read the transcript.", 502, async () => {
    const found = await transcript(v);
    return json({ paragraphs: found?.paragraphs, kind: found?.kind });
  });
}

/** Favorite the video playing in the player window, by video id (Creators-page videos have no card). */
/** @param {Ctx} ctx */
async function playerFavorite({ body }) {
  const { videoId } = body;
  if (typeof videoId !== "string" || !videoId) return fail("Missing video id.", 400);
  return (await favoriteVideo(videoId)) ? json({ ok: true }) : fail("No such video.", 404);
}
