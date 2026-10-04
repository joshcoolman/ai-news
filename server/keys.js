import { AsyncLocalStorage } from "node:async_hooks";

/*
  Where the two API keys come from. The server's environment wins. When it has
  none, the browser sends its own with each request (x-anthropic-key,
  x-youtube-key); they last as long as that request and whatever it starts, so
  a refresh keeps running on the keys of the request that began it. A key from
  the browser is never written down or logged.
*/

/** @type {Record<KeyName, string>} */
const ENV = { anthropic: "ANTHROPIC_API_KEY", youtube: "YOUTUBE_API_KEY" };

/** @type {AsyncLocalStorage<Partial<Record<KeyName, string>>>} */
const sent = new AsyncLocalStorage();

export class MissingKeyError extends Error {
  /** @param {KeyName} name */
  constructor(name) {
    super(`No ${name} key: set ${ENV[name]} in .env.local, or add your keys in the browser.`);
    this.key = name;
  }
}

/**
 * Run a request's handler with the keys its headers carried.
 * @template T
 * @param {import("node:http").IncomingHttpHeaders} headers
 * @param {() => T} fn
 */
export function withKeys(headers, fn) {
  const one = (/** @type {string} */ name) => {
    const v = headers[name];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return sent.run({ anthropic: one("x-anthropic-key"), youtube: one("x-youtube-key") }, fn);
}

/** @param {KeyName} name */
export function key(name) {
  const value = process.env[ENV[name]] || sent.getStore()?.[name];
  if (!value) throw new MissingKeyError(name);
  return value;
}

/** Per key: "server" when the environment has it, "browser" when the page must send it. */
export function keySources() {
  const source = (/** @type {KeyName} */ name) => (process.env[ENV[name]] ? "server" : "browser");
  return { anthropic: source("anthropic"), youtube: source("youtube") };
}
