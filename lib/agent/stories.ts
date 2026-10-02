import { promises as fs } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, STORIES_MODEL } from "./client";
import { ask } from "./small";
import { domainOf, normalizeUrl } from "../feed";
import type { AvoidEntry } from "../store/types";
import { LANES, STORIES_PER_LANE } from "../refresh-events";

export { STORIES_PER_LANE };

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

export type Usage = { input: number; output: number; searches: number; fetches: number };

/** Rough spend from usage. Web search is billed per search on top of tokens. */
export function estimateCost(model: string, u: Usage): number {
  const [inPrice, outPrice] = PRICES[model] ?? PRICES["claude-fable-5-1"];
  return (u.input * inPrice + u.output * outPrice) / 1_000_000 + u.searches * 0.01;
}
const PRICES: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-4-5-20251001": [1, 5],
};

function context(input: StoriesInput): string {
  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    "Creator video titles from the last 7 days (the lens for what is worth covering):",
    input.creatorTitles.length
      ? input.creatorTitles.map((v) => `- ${v.channel} (${v.publishedAt.slice(0, 10)}): ${v.title}`).join("\n")
      : "- none",
    "Cards already in the reader's feed from the last 30 days. Do not repeat these:",
    input.recentCards.length
      ? input.recentCards.map((c) => `- [${c.label}] ${c.title} <${c.link}>`).join("\n")
      : "- none",
  ].join("\n\n");
}

function avoidText(avoid: AvoidEntry[]): string {
  return avoid.length
    ? "The reader has asked not to see these. Do not write a card that matches any of them:\n" +
        avoid.map((a) => `- "${a.reason}" (said about: ${a.fromTitle})`).join("\n")
    : "";
}

/** Split this week's ground into non-overlapping lanes for the parallel agents. */
export async function planLanes(input: StoriesInput): Promise<Lane[]> {
  const out = await ask(
    z.object({ lanes: z.array(z.object({ name: z.string(), brief: z.string() })) }),
    `Plan ${LANES} search lanes for finding new things in AI that someone who builds with AI tools would want to click on: ` +
      "models, tools, products, demos and open-source projects that now exist, days old. Use the creator video titles to see what is " +
      "currently worth covering, including nearby things they have not covered. Lanes must not overlap. " +
      "name: two or three words. brief: one sentence saying what to look for. " +
      avoidText(input.avoid),
    context(input),
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
  const guidelines = await fs.readFile(path.join(process.cwd(), "agent", "guidelines.md"), "utf8");
  const system = [
    guidelines.trim(),
    avoidText(input.avoid),
    `You are one of ${others.length + 1} searchers working in parallel. Your lane: ${lane.name}. ${lane.brief}`,
    others.length ? "Other searchers cover these; stay out of them:\n" + others.map((o) => `- ${o.name}: ${o.brief}`).join("\n") : "",
    `Return at most ${STORIES_PER_LANE} stories. Fewer is fine; none is fine. Be quick: a few searches, open only the pages you will cite. ` +
      "Every sourceUrl must be a page you saw in a web_search result or opened with web_fetch in this turn.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const Output = z.object({ stories: z.array(Story).max(STORIES_PER_LANE) });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: context(input) }];
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
