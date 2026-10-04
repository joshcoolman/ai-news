import { keySources, MissingKeyError } from "./server/keys.js";
import { mutate, read } from "./server/store.js";
import { buildFeed, favoriteCards } from "./server/feed/cards.js";
import { favoriteCopy } from "./server/feed/rules.js";
import { keyWorks as youtubeKeyWorks, resolveCreator, UserInputError } from "./server/youtube.js";
import { keyWorks as claudeKeyWorks } from "./server/ai/client.js";
import { grabRecent } from "./server/creators/grab.js";
import { recentVideos } from "./server/creators/recent.js";
import { topicsFor } from "./server/creators/topics.js";
import { clampDays, FEED_CAP, MAX_DAYS, MIN_DAYS } from "./server/creators/window.js";
import { LANES, STORIES_PER_LANE } from "./server/refresh/events.js";
import { cancelRefresh, RefreshBusyError, refreshRunning, startRefresh, subscribe } from "./server/refresh/run.js";
import { searchFromVideo, searchHome } from "./server/search.js";
import { moreLikeThis, NotFoundError } from "./server/more-like-this.js";
import { favoriteVideo, playerVideo } from "./server/player.js";

/*
  Every URL the app answers, in one place. Pages are files in browser/; an API
  route is a method, a path (`:id` is a parameter) and the handler below it.
  Handlers stay thin: read the request, call into server/, shape the reply.
*/

/** @type {Record<string, string>} */
export const pages = {
  "/": "index.html",
  "/creators": "creators.html",
  "/favorites": "favorites.html",
  "/settings": "settings.html",
  "/player": "player.html",
};

/** @type {[method: string, path: string, handler: (ctx: Ctx) => Reply | void | Promise<Reply | void>][]} */
export const routes = [
  ["GET", "/api/config", config],
  ["POST", "/api/keys/check", checkKeys],

  ["GET", "/api/feed", feed],
  ["POST", "/api/items/:id/remove", removeItem],
  ["POST", "/api/items/:id/restore", restoreItem],
  ["POST", "/api/items/:id/favorite", favoriteItem],
  ["POST", "/api/items/:id/more", moreForItem],

  ["POST", "/api/refresh", refresh],
  ["GET", "/api/refresh/events", refreshEvents],
  ["POST", "/api/refresh/cancel", refreshCancel],

  ["POST", "/api/search", searchTyped],
  ["POST", "/api/search/video", searchVideo],

  ["GET", "/api/favorites", favorites],
  ["DELETE", "/api/favorites/:id", deleteFavorite],
  ["POST", "/api/favorites/:id/more", moreForFavorite],

  ["GET", "/api/creators", creators],
  ["POST", "/api/creators", addCreator],
  ["POST", "/api/creators/resolve", lookUpCreator],
  ["GET", "/api/creators/recent", creatorsRecent],
  ["GET", "/api/creators/topics", creatorsTopics],
  ["PATCH", "/api/creators/:id", editCreator],
  ["DELETE", "/api/creators/:id", deleteCreator],

  ["GET", "/api/settings", settings],
  ["PATCH", "/api/settings", editSettings],

  ["GET", "/api/player/video", playerInfo],
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
 * left to the server, which answers 401 so the page can ask for keys.
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
 * What every page reads first: where each key comes from (so it knows whether
 * to ask for them), whether a refresh is running, and the numbers the pages
 * must agree with the server on.
 */
function config() {
  return json({
    keys: keySources(),
    refreshing: refreshRunning(),
    plan: { lanes: LANES, slots: STORIES_PER_LANE },
    days: { min: MIN_DAYS, max: MAX_DAYS },
    feedCap: FEED_CAP,
  });
}

/** Whether the keys this request carries are accepted, checked before the browser saves them. */
async function checkKeys() {
  const [anthropic, youtube] = await Promise.all([claudeKeyWorks(), youtubeKeyWorks()]);
  return json({ anthropic, youtube });
}

/* The feed */

async function feed() {
  return json({ ...buildFeed(await read()), refresh: { running: refreshRunning() } });
}

/** Remove a card. It stays stored with `removedAt`, so a later refresh never adds it back. */
/** @param {Ctx} ctx */
async function removeItem({ params }) {
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === params.id);
    if (!item) return false;
    item.removedAt ??= new Date().toISOString();
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}

/** Undo a removal: the player's star puts back a card its own favoriting removed. */
/** @param {Ctx} ctx */
async function restoreItem({ params }) {
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === params.id);
    if (!item) return false;
    delete item.removedAt;
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}

/** Copy a feed card into Favorites. Idempotent. The copy drops feed-only state, so it stands on its own. */
/** @param {Ctx} ctx */
async function favoriteItem({ params }) {
  const found = await mutate((d) => {
    const item = d.items.find((i) => i.id === params.id);
    if (!item) return false;
    if (d.favorites.some((f) => f.item.id === params.id)) return true;
    d.favorites.push({ item: favoriteCopy(item), favoritedAt: new Date().toISOString() });
    return true;
  });
  return found ? json({ ok: true }) : fail("No such card.", 404);
}

/** @param {Ctx} ctx */
function moreForItem({ params }) {
  return orFail("Search failed.", 500, async () => {
    try {
      return json(await moreLikeThis(params.id));
    } catch (err) {
      if (err instanceof NotFoundError) return fail("No such card.", 404);
      throw err;
    }
  });
}

/* Refresh */

/** Start a refresh. Progress arrives on /api/refresh/events. */
function refresh() {
  try {
    startRefresh();
    return json({ started: true });
  } catch (err) {
    if (err instanceof RefreshBusyError) return fail(err.message, 409);
    throw err;
  }
}

/**
 * Server-Sent Events for the running refresh: the whole log so far, then each
 * new event, closing after "done". Sends a lone "idle" event when nothing runs.
 * @param {Ctx} ctx
 */
function refreshEvents({ req, res }) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  let closed = false;
  /** @type {(() => void) | null} */
  let unsubscribe = null;
  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    res.end();
  };
  const send = (/** @type {RefreshEvent | { type: "idle" }} */ e) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (e.type === "done" || e.type === "idle") queueMicrotask(close);
  };
  unsubscribe = subscribe(send);
  if (!unsubscribe) send({ type: "idle" });
  req.on("close", close);
}

/** Stop the story lanes that are still running. Everything already found is kept. */
function refreshCancel() {
  return json({ cancelled: cancelRefresh() });
}

/* Search */

/** Search YouTube from home. Refused while a refresh runs: both claim the next batch number. */
/** @param {Ctx} ctx */
async function searchTyped({ body }) {
  const q = typeof body.query === "string" ? body.query.trim() : "";
  if (!q) return fail("Type something to search for.", 400);
  if (refreshRunning()) return fail("A refresh is running.", 409);
  return orFail("Search failed", 500, async () => json(await searchHome(q)));
}

/** Search from a video's topic (Creators page magnifier). Same refusal as /api/search while a refresh runs. */
/** @param {Ctx} ctx */
async function searchVideo({ body }) {
  const { title, channel } = body;
  if (typeof title !== "string" || !title.trim()) return fail("Missing video title.", 400);
  if (refreshRunning()) return fail("A refresh is running.", 409);
  return orFail("Search failed", 500, async () => json(await searchFromVideo({ title, channel: typeof channel === "string" ? channel : "" })));
}

/* Favorites */

async function favorites() {
  return json(favoriteCards(await read()));
}

/** Delete from Favorites only; the feed is untouched. */
/** @param {Ctx} ctx */
async function deleteFavorite({ params }) {
  await mutate((d) => {
    d.favorites = d.favorites.filter((f) => f.item.id !== params.id);
  });
  return json({ ok: true });
}

/** "More like this" on a favorite: results go into Favorites only. */
/** @param {Ctx} ctx */
function moreForFavorite({ params }) {
  return orFail("Search failed.", 500, async () => {
    try {
      return json(await moreLikeThis(params.id, "favorites"));
    } catch (err) {
      if (err instanceof NotFoundError) return fail("No such favorite.", 404);
      throw err;
    }
  });
}

/* Creators */

async function creators() {
  return json((await read()).creators);
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
  const creator = { ...info, guidance: typeof body.guidance === "string" ? body.guidance.trim() : "" };
  const added = await mutate((d) => {
    if (d.creators.some((c) => c.channelId === info.channelId)) return false;
    d.creators.push(creator);
    return true;
  });
  // The quick grab claims the next batch number, so it waits out a running refresh (the next refresh picks the videos up).
  /** @type {number | undefined} */
  let grabbed;
  if (added && body.grab && !refreshRunning()) {
    try {
      grabbed = await grabRecent(creator);
    } catch (err) {
      console.error(err);
    }
  }
  return json({ added, creator: info, grabbed });
}

/** Look up what a pasted URL points at, without adding anything. Feeds the "Found ..." line in the Add creator popup. */
/** @param {Ctx} ctx */
async function lookUpCreator({ body }) {
  const creator = await creatorFrom(body.url);
  if ("status" in creator) return creator;
  const listed = (await read()).creators.some((c) => c.channelId === creator.channelId);
  return json({ creator, listed });
}

/** The Creators page's videos. Lists are cached for the day; `?fresh=1` (a reload of the page) reads them again. */
/** @param {Ctx} ctx */
function creatorsRecent({ query }) {
  return orFail("Could not read creator feeds.", 500, async () => json(await recentVideos((await read()).creators, query.has("fresh"))));
}

/** Topics across the Creators page's videos. Slow (a model call) the first time, so the page asks for it after it draws. */
function creatorsTopics() {
  return orFail("Could not group topics.", 500, async () => json({ topics: await topicsFor((await read()).creators) }));
}

/** @param {Ctx} ctx */
async function editCreator({ params, body }) {
  const { guidance } = body;
  if (typeof guidance !== "string") return fail("guidance is required.", 400);
  const found = await mutate((d) => {
    const c = d.creators.find((x) => x.channelId === params.id);
    if (c) c.guidance = guidance.trim();
    return !!c;
  });
  return found ? json({ ok: true }) : fail("No such creator.", 404);
}

/** Stops future fetches. Their existing cards stay in the feed. */
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
  const { onFavorite, creatorsWindowDays, skipMembersOnly } = body;
  if (onFavorite !== undefined && !["ask", "remove", "keep"].includes(onFavorite)) return fail("onFavorite must be ask, remove or keep.", 400);
  if (skipMembersOnly !== undefined && typeof skipMembersOnly !== "boolean") return fail("skipMembersOnly must be true or false.", 400);
  if (onFavorite === undefined && creatorsWindowDays === undefined && skipMembersOnly === undefined) return fail("Nothing to change.", 400);
  return json(
    await mutate((d) => {
      if (onFavorite !== undefined) d.settings.onFavorite = onFavorite;
      if (creatorsWindowDays !== undefined) d.settings.creatorsWindowDays = clampDays(creatorsWindowDays);
      if (skipMembersOnly !== undefined) d.settings.skipMembersOnly = skipMembersOnly;
      return d.settings;
    }),
  );
}

/* Player */

/** The video the player window is playing, as the app knows it: `?v=<video id>`, and `&t=<title>` for one found nowhere. */
/** @param {Ctx} ctx */
async function playerInfo({ query }) {
  const v = query.get("v") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(v)) return fail("Missing video id.", 400);
  return json(await playerVideo(v, query.get("t") ?? ""));
}

/** Favorite the video playing in the player window, by video id (Creators-page videos have no card). */
/** @param {Ctx} ctx */
async function playerFavorite({ body }) {
  const { videoId } = body;
  if (typeof videoId !== "string" || !videoId) return fail("Missing video id.", 400);
  return (await favoriteVideo(videoId)) ? json({ ok: true }) : fail("No such video.", 404);
}
