import { key } from "../keys.js";

/*
  The Claude Messages API over fetch: one plain call for the small jobs, one
  streamed call for the story lanes. What a client library would do quietly is
  written out here: the headers, the retries, and reading the event stream.
*/

const API = "https://api.anthropic.com/v1/messages";

/**
 * The story lanes. Sonnet 5.5 because lanes must run at once: measured on
 * 2026-10-01, four Fable 5.1 calls with server tools ran one after another
 * (63s) where four Sonnet 5.5 calls ran in parallel (13s).
 */
export const STORIES_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** The small calls: the lane planner, the creator-video filter and the two "more like this" steps. */
export const SMALL_MODEL = "claude-haiku-4-5-20251001";

/** Dollars per million tokens, [input, output, input read from the cache]. */
/** @type {Record<string, [number, number, number]>} */
const PRICES = {
  "claude-fable-5-1": [10, 50, 0.25],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-haiku-4-5-20251001": [1, 5, 0.1],
};
/** Storing input in the cache (for five minutes) costs this much more than reading it fresh. */
const CACHE_WRITE = 1.25;

/**
 * Rough spend from usage. Web search is billed per search on top of tokens.
 * @param {string} model
 * @param {Usage} u
 */
export function estimateCost(model, u) {
  const [inPrice, outPrice, readPrice] = PRICES[model] ?? PRICES["claude-fable-5-1"];
  const tokens = u.input * inPrice + u.cacheWrite * inPrice * CACHE_WRITE + u.cacheRead * readPrice + u.output * outPrice;
  return tokens / 1_000_000 + u.searches * 0.01;
}

/**
 * What the same usage would have cost with nothing cached: the number that says what caching saved.
 * @param {string} model
 * @param {Usage} u
 */
export function uncachedCost(model, u) {
  return estimateCost(model, { ...u, input: u.input + u.cacheWrite + u.cacheRead, cacheWrite: 0, cacheRead: 0 });
}

/* JSON Schema for structured output, where every object is closed and every property required. */

/** @param {Record<string, object>} properties */
export const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
/** @param {object} items */
export const arr = (items) => ({ type: "array", items });
/** @param {string} [description] */
export const str = (description) => ({ type: "string", ...(description && { description }) });
export const int = { type: "integer" };
export const bool = { type: "boolean" };

const RETRIES = 2;

/**
 * Send one request, retrying what is worth retrying (a dropped connection,
 * 408, 409, 429 and any 5xx) twice, waiting as long as the API asks or 0.5s
 * then 1s. Returns the successful response.
 * @param {object} body
 * @param {AbortSignal} signal
 */
async function post(body, signal) {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key("anthropic"), "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal,
  };
  for (let attempt = 0; ; attempt++) {
    let wait = 500 * 2 ** attempt;
    try {
      const res = await fetch(API, init);
      if (res.ok) return res;
      /** @type {any} */
      const problem = await res.json().catch(() => null);
      const detail = problem?.error?.message ?? "";
      const retryable = [408, 409, 429].includes(res.status) || res.status >= 500;
      if (!retryable || attempt >= RETRIES) throw new ClaudeError(`Claude answered ${res.status}${detail ? `: ${detail}` : ""}`);
      const asked = Number(res.headers.get("retry-after")) * 1000;
      if (asked > 0 && asked <= 60_000) wait = asked;
    } catch (err) {
      if (err instanceof ClaudeError || signal.aborted || attempt >= RETRIES) throw err;
    }
    await new Promise((done) => setTimeout(done, wait));
  }
}

class ClaudeError extends Error {}

/** Whether the key in use is accepted: lists one model, which costs nothing. */
export async function keyWorks() {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key("anthropic"), "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** @param {ContentBlock[]} content */
export function textOf(content) {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * One small-model call with structured output: the reply is JSON matching
 * `schema`, already parsed. Name the shape where the result lands.
 * @param {object} schema
 * @param {string} system
 * @param {string} user
 * @returns {Promise<any>}
 */
export async function ask(schema, system, user) {
  const res = await post(
    {
      model: SMALL_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    },
    AbortSignal.timeout(300_000),
  );
  const message = /** @type {ClaudeMessage} */ (await res.json());
  console.log(`[small] input=${message.usage.input_tokens} output=${message.usage.output_tokens}`);
  if (message.stop_reason !== "end_turn") throw new Error(`small model returned ${message.stop_reason}`);
  return JSON.parse(textOf(message.content));
}

/**
 * One streamed call, for turns too long to wait on in silence. `onBlock` gets
 * each content block as it completes; the whole message is returned at the end,
 * its blocks exactly as the API sent them so they can be sent back.
 * @param {object} body
 * @param {(block: ContentBlock) => void} onBlock
 * @param {AbortSignal} signal
 * @returns {Promise<ClaudeMessage>}
 */
export async function stream(body, onBlock, signal) {
  const res = await post({ ...body, stream: true }, signal);
  /** @type {ClaudeMessage} */
  const message = { content: [], stop_reason: null, usage: {} };
  // A tool call's input arrives as pieces of JSON text, joined and parsed when its block ends.
  /** @type {Map<number, string>} */
  const inputs = new Map();
  for await (const event of events(res)) {
    const block = message.content[event.index];
    switch (event.type) {
      case "message_start":
        message.usage = event.message.usage ?? {};
        break;
      case "content_block_start":
        message.content[event.index] = event.content_block;
        break;
      case "content_block_delta": {
        const d = event.delta;
        if (d.type === "text_delta") block.text += d.text;
        else if (d.type === "input_json_delta") inputs.set(event.index, (inputs.get(event.index) ?? "") + d.partial_json);
        else if (d.type === "citations_delta") (block.citations ??= []).push(d.citation);
        else if (d.type === "thinking_delta") block.thinking += d.thinking;
        else if (d.type === "signature_delta") block.signature = d.signature;
        break;
      }
      case "content_block_stop": {
        const json = inputs.get(event.index);
        if (json) block.input = JSON.parse(json);
        onBlock(block);
        break;
      }
      case "message_delta":
        message.stop_reason = event.delta.stop_reason ?? message.stop_reason;
        message.usage = { ...message.usage, ...event.usage };
        break;
      case "error":
        throw new Error(`Claude stream failed: ${event.error?.message ?? "unknown error"}`);
    }
  }
  return message;
}

/**
 * The events of a server-sent-event response: frames split on a blank line, each frame's `data:` lines parsed as JSON.
 * @param {Response} res
 * @returns {AsyncGenerator<any>}
 */
async function* events(res) {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
      const data = buffer
        .slice(0, end)
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      buffer = buffer.slice(end + 2);
      if (data) yield JSON.parse(data);
    }
  }
}
