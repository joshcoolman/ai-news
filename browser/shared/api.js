import { askForKeys, keyHeaders, savedKeys } from "./keys.js";

/*
  How pages talk to the server: every request carries the browser's keys (when
  it has any), and every page starts with `boot`, which reads /api/config and
  asks for keys first if the server has none.
*/

/**
 * What /api/config answers: where each key comes from, whether a refresh is
 * running, and the numbers the server and the pages must agree on.
 * @typedef {{
 *   keys: Record<KeyName, "server" | "browser">,
 *   refreshing: boolean,
 *   plan: { lanes: number, slots: number },
 *   days: { min: number, max: number },
 *   feedCap: number,
 * }} Config
 */

/**
 * @param {string} method
 * @param {string} url
 * @param {unknown} [payload]
 */
export async function send(method, url, payload) {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: { ...keyHeaders(), ...(payload !== undefined && { "Content-Type": "application/json" }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  // The server wanted a key this browser no longer has: home is where they are added.
  if (res.status === 401 && location.pathname !== "/") location.replace("/");
  return res;
}

export const get = (/** @type {string} */ url) => send("GET", url);
export const post = (/** @type {string} */ url, /** @type {unknown} */ payload = undefined) => send("POST", url, payload);
export const patch = (/** @type {string} */ url, /** @type {unknown} */ payload) => send("PATCH", url, payload);
export const del = (/** @type {string} */ url) => send("DELETE", url);

/**
 * GET and parse, or throw.
 * @param {string} url
 * @returns {Promise<any>}
 */
export async function load(url) {
  const res = await get(url);
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

/**
 * Every page's first step. Returns the config once the browser has whatever keys the server lacks.
 * @returns {Promise<Config>}
 */
export async function boot() {
  /** @type {Config} */
  const config = await (await fetch("/api/config", { cache: "no-store" })).json();
  const needed = /** @type {KeyName[]} */ (Object.keys(config.keys)).filter((name) => config.keys[name] === "browser");
  const have = savedKeys();
  if (needed.some((name) => !have[name])) {
    if (location.pathname !== "/") {
      location.replace("/");
      return new Promise(() => {});
    }
    await askForKeys(needed);
  }
  return config;
}
