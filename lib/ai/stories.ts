import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, ask, STORIES_MODEL, type Usage } from "./client";
import { prompt } from "./prompts";
import { domainOf, normalizeUrl } from "../feed/rules";
import type { AvoidEntry } from "../store/types";
import { LANES, STORIES_PER_LANE } from "../refresh/events";

/*
  Stories come from parallel lanes. A small planner call splits this week's
  ground into lanes; each lane is its own short agent turn with web search and
  web fetch, told the other lanes' briefs so it stays in its own.
*/

export const Story = z.object({
  label: z.string().describe("One to three words naming the specific thing."),
  title: z.string().describe("One plain sentence: who made it and what it does."),
  sourceUrl: z.string().describe("A page you opened or saw in search results this turn."),
  topic: z.string().describe("A short topic for the meta line, e.g. 'coding agents'."),
});
export type Story = z.infer<typeof Story>;

const SEARCHES_PER_LANE = 4;
const MAX_CONTINUATIONS = 8;

export type StoriesInput = {
  avoid: AvoidEntry[];
  /** Titles of creator videos from the last 7 days, read from the channel feeds. */
  creatorTitles: { channel: string; title: string; publishedAt: string }[];
  /** Cards from the last 30 days, removed ones included. */
  recentCards: { label: string; title: string; link: string }[];
};

export type Lane = { id: string; name: string; brief: string };

/** The user turn for the planner and every lane. */
function context(input: StoriesInput): Promise<string> {
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

/** The avoid list, word for word, or "" when it is empty. */
async function avoidText(avoid: AvoidEntry[]): Promise<string> {
  if (!avoid.length) return "";
  return prompt("avoid", { entries: avoid.map((a) => `- "${a.reason}" (said about: ${a.fromTitle})`).join("\n") });
}

/** Split this week's ground into non-overlapping lanes for the parallel agents. */
export async function planLanes(input: StoriesInput): Promise<Lane[]> {
  const out = await ask(
    z.object({ lanes: z.array(z.object({ name: z.string(), brief: z.string() })) }),
    await prompt("plan-lanes", { lanes: LANES, avoid: await avoidText(input.avoid) }),
    await context(input),
  );
  return out.lanes.slice(0, LANES).map((l, i) => ({ id: `lane-${i}`, name: l.name.trim(), brief: l.brief.trim() }));
}

export type LaneEvents = {
  onActivity: (text: string) => void;
  onUsage: (delta: Usage) => void;
};

/**
 * One lane: a short agent turn with web search and web fetch. Loops over
 * `pause_turn`, and returns only stories whose source the agent actually saw.
 */
export async function runLane(
  lane: Lane,
  others: Lane[],
  input: StoriesInput,
  events: LaneEvents,
  signal: AbortSignal,
): Promise<Story[]> {
  const system = [
    await prompt("stories"),
    await prompt("stories-lane", {
      avoid: await avoidText(input.avoid),
      count: others.length + 1,
      name: lane.name,
      brief: lane.brief,
      others: others.map((o) => `- ${o.name}: ${o.brief}`).join("\n"),
      max: STORIES_PER_LANE,
    }),
  ].join("\n\n");

  const Output = z.object({ stories: z.array(Story).max(STORIES_PER_LANE) });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: await context(input) }];
  const seen = new Set<string>();
  let final: Anthropic.Message | undefined;

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const stream = anthropic().messages.stream(
      {
        model: STORIES_MODEL,
        max_tokens: 32000,
        system,
        messages,
        output_config: { format: zodOutputFormat(Output) },
        tools: [
          // The plain tool versions: the dynamic-filtering ones add code-execution round trips to every search.
          { type: "web_search_20250305", name: "web_search", max_uses: SEARCHES_PER_LANE },
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 6 },
        ],
      },
      { signal },
    );
    stream.on("contentBlock", (block) => {
      const text = describe(block);
      if (text) events.onActivity(text);
    });
    const message = await stream.finalMessage();
    final = message;
    events.onUsage({
      input: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
      output: message.usage.output_tokens,
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
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let stories: Story[];
  try {
    stories = Output.parse(JSON.parse(text)).stories;
  } catch (err) {
    console.log(`[lane ${lane.name}] could not parse output: ${(err as Error).message}`);
    return [];
  }
  return stories.filter((s) => {
    if (seen.has(normalizeUrl(s.sourceUrl))) return true;
    console.log(`[lane ${lane.name}] dropped "${s.label}": ${s.sourceUrl} was not seen this turn`);
    return false;
  });
}

/** A one-line description of what the agent is doing, for the live activity line. */
function describe(block: Anthropic.ContentBlock): string | undefined {
  if (block.type !== "server_tool_use") return undefined;
  const input = (block.input ?? {}) as { query?: string; url?: string };
  if (block.name === "web_search" && input.query) return `Searching "${input.query}"`;
  if (block.name === "web_fetch" && input.url) return `Reading ${domainOf(input.url) || input.url}`;
  return undefined;
}

function collectSeen(content: Anthropic.ContentBlock[], seen: Set<string>) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) seen.add(normalizeUrl(r.url));
    } else if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      seen.add(normalizeUrl(block.content.url));
    }
  }
}
