import "./server/env.js";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pages, routes } from "./routes.js";
import { MissingKeyError, withKeys } from "./server/keys.js";

/*
  The whole web server: files from browser/ for pages and their scripts and
  styles, and routes.js for everything under /api. Nothing outside browser/ is
  ever sent, so server code and keys cannot reach a page by accident.
*/

const BROWSER = path.join(import.meta.dirname, "browser");

/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// "/api/items/:id/remove" becomes a pattern whose named groups are the parameters.
const table = routes.map(([method, route, handler]) => ({
  method,
  handler,
  pattern: new RegExp(`^${route.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`),
}));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else await file(res, pages[url.pathname] ?? url.pathname);
  } catch (err) {
    console.error(err);
    if (res.headersSent) res.end();
    else send(res, 500, { error: "Something went wrong." });
  }
});

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {URL} url
 */
async function api(req, res, url) {
  for (const route of table) {
    const match = route.method === req.method && route.pattern.exec(url.pathname);
    if (!match) continue;
    const params = Object.fromEntries(Object.entries(match.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
    const ctx = { params, query: url.searchParams, body: await body(req), req, res };
    try {
      const reply = await withKeys(req.headers, () => route.handler(ctx));
      if (reply) send(res, reply.status, reply.body);
    } catch (err) {
      if (!(err instanceof MissingKeyError)) throw err;
      send(res, 401, { error: err.message, missingKey: err.key });
    }
    return;
  }
  send(res, 404, { error: "No such route." });
}

/**
 * The request's JSON body, or {} when there is none or it does not parse.
 * @param {http.IncomingMessage} req
 * @returns {Promise<Record<string, any>>}
 */
async function body(req) {
  if (req.method === "GET") return {};
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 1_000_000) return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

/**
 * Send one file from browser/. A path that climbs out of it is treated as missing.
 * @param {http.ServerResponse} res
 * @param {string} name
 */
async function file(res, name) {
  const target = path.join(BROWSER, path.normalize(decodeURIComponent(name)));
  /** @type {Buffer | undefined} */
  let content;
  if (target.startsWith(BROWSER + path.sep)) content = await fs.readFile(target).catch(() => undefined);
  if (!content) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  // no-cache: the browser keeps a copy but checks it is current, so an edited file shows on reload.
  res.writeHead(200, { "Content-Type": TYPES[path.extname(target)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(content);
}

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`AI News on http://localhost:${port}`));
