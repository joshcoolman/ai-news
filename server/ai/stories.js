import { arr, ask, obj, str, stream, STORIES_MODEL, textOf } from "./client.js";
import { prompt } from "./prompts.js";
import { domainOf, normalizeUrl } from "../feed/rules.js";
import { LANES, STORIES_PER_LANE } from "../refresh/events.js";

/*
  Stories come from parallel lanes. A small planner call splits this week's
  ground into lanes; each lane is its own short agent turn with web search and
  web fetch, told the other lanes' briefs so it stays in its own.
*/

const StoryShape = obj({
  label: str("One to three words naming the specific thing."),
  title: str("One plain sentence: who made it and what it does."),
  sourceUrl: str("A page you opened or saw in search results this turn."),
  topic: str("A short topic for the meta line, e.g. 'coding agents'."),
});

const SEARCHES_PER_LANE = 4;
const MAX_CONTINUATIONS = 8;

/**
 * The user turn for the planner and every lane.
 * @param {StoriesInput} input
 */
function context(input) {
  return prompt("stories-context", {
    today: new Date().toISOString().slice(0, 10),
    creatorTitles: input.creatorTitles.length
      ? input.creatorTitles.map((v) => `- ${v.channel} (${v.publishedAt.slice(0, 10)}): ${v.title}`).join("\n")
      : "- none",
    recentCards: input.recentCards.length
      ? input.recentCards.map((c) => `- [${c.label}] ${c.title} <${c.link}>`).join("\n")
      : "- none",
  });
}

/**
 * Split this week's ground into non-overlapping lanes for the parallel agents.
 * @param {StoriesInput} input
 * @returns {Promise<Lane[]>}
 */
export async function planLanes(input) {
  /** @type {{ lanes: { name: string, brief: string }[] }} */
  const out = await ask(obj({ lanes: arr(obj({ name: str(), brief: str() })) }), await prompt("plan-lanes", { lanes: LANES }), await context(input));
  return out.lanes.slice(0, LANES).map((l, i) => ({ id: `lane-${i}`, name: l.name.trim(), brief: l.brief.trim() }));
}

/**
 * One lane: a short agent turn with web search and web fetch. Loops over
 * `pause_turn`, and returns only stories whose source the agent actually saw.
 * @param {Lane} lane
 * @param {Lane[]} others
 * @param {StoriesInput} input
 * @param {{ onActivity: (text: string) => void, onUsage: (delta: Usage) => void }} events
 * @param {AbortSignal} signal
 * @returns {Promise<Story[]>}
 */
export async function runLane(lane, others, input, events, signal) {
  const system = [
    await prompt("stories"),
    await prompt("stories-lane", {
      count: others.length + 1,
      name: lane.name,
      brief: lane.brief,
      others: others.map((o) => `- ${o.name}: ${o.brief}`).join("\n"),
      max: STORIES_PER_LANE,
    }),
  ].join("\n\n");

  /** @type {{ role: string, content: string | ContentBlock[] }[]} */
  const messages = [{ role: "user", content: await context(input) }];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {ClaudeMessage | undefined} */
  let final;

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const message = await stream(
      {
        model: STORIES_MODEL,
        max_tokens: 32000,
        system,
        messages,
        output_config: { format: { type: "json_schema", schema: obj({ stories: { ...arr(StoryShape), description: `At most ${STORIES_PER_LANE}.` } }) } },
        tools: [
          // The plain tool versions: the dynamic-filtering ones add code-execution round trips to every search.
          { type: "web_search_20250305", name: "web_search", max_uses: SEARCHES_PER_LANE },
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 6 },
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
      input: (message.usage.input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0),
      output: message.usage.output_tokens ?? 0,
      searches: message.usage.server_tool_use?.web_search_requests ?? 0,
      fetches: message.usage.server_tool_use?.web_fetch_requests ?? 0,
    });
    collectSeen(message.content, seen);
    if (message.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: message.content });
  }

  if (!final || final.stop_reason !== "end_turn") {
    console.log(`[lane ${lane.name}] ended with ${final?.stop_reason}; no stories`);
    return [];
  }
  /** @type {Story[]} */
  let stories;
  try {
    stories = JSON.parse(textOf(final.content)).stories.slice(0, STORIES_PER_LANE);
  } catch (err) {
    console.log(`[lane ${lane.name}] could not parse output: ${/** @type {Error} */ (err).message}`);
    return [];
  }
  return stories.filter((s) => {
    if (seen.has(normalizeUrl(s.sourceUrl))) return true;
    console.log(`[lane ${lane.name}] dropped "${s.label}": ${s.sourceUrl} was not seen this turn`);
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
