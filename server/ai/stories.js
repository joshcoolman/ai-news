import { arr, ask, obj, str, stream, STORIES_MODEL, textOf } from "./client.js";
import { prompt } from "./prompts.js";
import { domainOf, mentioning, newNames, normalizeUrl } from "../feed/rules.js";
import { MAX_NAMES, STORIES_PER_NAME } from "../refresh/events.js";

/*
  Stories come in two steps. A small call reads this week's creator titles and
  chapter lines and lists the named things they are about; then each name gets
  its own short agent turn with web search and web fetch, whose one job is to
  find the page that says what the thing is, quickly. A name that finds no
  page still becomes a card (the refresh makes it), so the search gives up
  early rather than trying hard.
*/

const StoryShape = obj({
  label: str("One to three words naming the specific thing."),
  title: str("One plain sentence: who made it and what it does."),
  sourceUrl: str("A page you opened or saw in search results this turn."),
  topic: str("A short topic for the meta line, e.g. 'coding agents'."),
});

const SEARCHES_PER_NAME = 1;
const MAX_CONTINUATIONS = 8;
/** The most of one fetched page a search reads: about 6,000 words. */
const FETCH_TOKENS = 8000;

/**
 * The user turn for the extractor and every search: each title with its
 * chapter lines under it. The recent cards paragraph drops out when `recentCards` is empty.
 * @param {StoriesInput} input
 */
function context(input) {
  return prompt("stories-context", {
    today: new Date().toISOString().slice(0, 10),
    creatorTitles: input.creatorTitles.length
      ? input.creatorTitles
          .map((v) => [`- ${v.channel} (${v.publishedAt.slice(0, 10)}): ${v.title}`, ...v.chapters.map((c) => `    · ${c}`)].join("\n"))
          .join("\n")
      : "- none",
    recentCards: input.recentCards.map((c) => `- [${c.label}] ${c.title} <${c.link}>`).join("\n"),
  });
}

/**
 * The named things this week's creator titles and chapters are about, one
 * lane each, with what the creators said. Names already on Home are dropped
 * here as well as in the prompt.
 * @param {StoriesInput} input
 * @returns {Promise<Lane[]>}
 */
export async function extractNames(input) {
  /** @type {{ names: { name: string, heard: string }[] }} */
  const out = await ask(
    obj({ names: arr(obj({ name: str(), heard: str("One plain sentence: what the creators said about it.") })) }),
    await prompt("extract-names", { max: MAX_NAMES }),
    await context(input),
  );
  const heard = new Map(out.names.map((n) => [n.name.trim().toLowerCase(), n.heard.trim()]));
  return newNames(
    out.names.map((n) => n.name),
    input.recentCards,
    MAX_NAMES,
  ).map((name, i) => ({ id: `name-${i}`, name, heard: heard.get(name.toLowerCase()) ?? "" }));
}

/**
 * One name: a short agent turn with web search and web fetch, shown only the
 * titles and chapter lines that mention the name. Loops over `pause_turn`, and
 * returns only a story whose source the agent actually saw.
 * @param {Lane} lane
 * @param {StoriesInput} input
 * @param {{ onActivity: (text: string) => void, onUsage: (delta: Usage) => void }} events
 * @param {AbortSignal} signal
 * @returns {Promise<Story[]>}
 */
export async function defineName(lane, input, events, signal) {
  const system = [await prompt("stories"), await prompt("define", { name: lane.name, heard: lane.heard })].join("\n\n");

  /** @type {{ role: string, content: string | ContentBlock[] }[]} */
  const messages = [{ role: "user", content: await context({ creatorTitles: mentioning(lane.name, input.creatorTitles), recentCards: [] }) }];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {ClaudeMessage | undefined} */
  let final;

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const message = await stream(
      {
        model: STORIES_MODEL,
        max_tokens: 32000,
        /*
          A search is a loop: after every tool result the model reads everything
          so far again. With caching on, each step stores what it read and the
          next step reads it back at a tenth of the price; the API adds the
          storing points after each tool result by itself. Measured on
          2026-10-04, this is most of what a refresh costs.
        */
        cache_control: { type: "ephemeral" },
        system,
        messages,
        output_config: { format: { type: "json_schema", schema: obj({ stories: { ...arr(StoryShape), description: `At most ${STORIES_PER_NAME}.` } }) } },
        tools: [
          // The plain tool versions: the dynamic-filtering ones add code-execution round trips to every search.
          { type: "web_search_20250305", name: "web_search", max_uses: SEARCHES_PER_NAME },
          // A page is read to confirm what a thing is and who made it, which its opening says; the cap keeps one long page from costing as much as several searches.
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2, max_content_tokens: FETCH_TOKENS },
        ],
      },
      (block) => {
        const text = describe(block);
        if (text) events.onActivity(text);
      },
      signal,
    );
    final = message;
    events.onUsage({
      input: message.usage.input_tokens ?? 0,
      cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      output: message.usage.output_tokens ?? 0,
      searches: message.usage.server_tool_use?.web_search_requests ?? 0,
      fetches: message.usage.server_tool_use?.web_fetch_requests ?? 0,
    });
    collectSeen(message.content, seen);
    if (message.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: message.content });
  }

  if (!final || final.stop_reason !== "end_turn") {
    console.log(`[name ${lane.name}] ended with ${final?.stop_reason}; no story`);
    return [];
  }
  /** @type {Story[]} */
  let stories;
  try {
    stories = JSON.parse(textOf(final.content)).stories.slice(0, STORIES_PER_NAME);
  } catch (err) {
    console.log(`[name ${lane.name}] could not parse output: ${/** @type {Error} */ (err).message}`);
    return [];
  }
  return stories.filter((s) => {
    if (seen.has(normalizeUrl(s.sourceUrl))) return true;
    console.log(`[name ${lane.name}] dropped "${s.label}": ${s.sourceUrl} was not seen this turn`);
    return false;
  });
}

/**
 * A one-line description of what the agent is doing, for the live activity line.
 * @param {ContentBlock} block
 */
function describe(block) {
  if (block.type !== "server_tool_use") return undefined;
  const input = block.input ?? {};
  if (block.name === "web_search" && input.query) return `Searching "${input.query}"`;
  if (block.name === "web_fetch" && input.url) return `Reading ${domainOf(input.url) || input.url}`;
  return undefined;
}

/**
 * @param {ContentBlock[]} content
 * @param {Set<string>} seen
 */
function collectSeen(content, seen) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) seen.add(normalizeUrl(r.url));
    } else if (block.type === "web_fetch_tool_result" && block.content?.type === "web_fetch_result") {
      seen.add(normalizeUrl(block.content.url));
    }
  }
}
