import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// The key comes from ANTHROPIC_API_KEY in .env.local and never reaches the browser.
const g = globalThis as typeof globalThis & { __anthropic?: Anthropic };
export const anthropic = (): Anthropic => (g.__anthropic ??= new Anthropic());

/**
 * The story lanes. Sonnet 5.5 because lanes must run at once: measured on
 * 2026-10-01, four Fable 5.1 calls with server tools ran one after another
 * (63s) where four Sonnet 5.5 calls ran in parallel (13s).
 */
export const STORIES_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** The small calls: the lane planner, the creator-video filter and the two "more like this" steps. */
export const SMALL_MODEL = "claude-haiku-4-5-20251001";

/** Dollars per million tokens, [input, output]. */
const PRICES: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-4-5-20251001": [1, 5],
};

export type Usage = { input: number; output: number; searches: number; fetches: number };

/** Rough spend from usage. Web search is billed per search on top of tokens. */
export function estimateCost(model: string, u: Usage): number {
  const [inPrice, outPrice] = PRICES[model] ?? PRICES["claude-fable-5-1"];
  return (u.input * inPrice + u.output * outPrice) / 1_000_000 + u.searches * 0.01;
}

/** One small-model call with structured output. */
export async function ask<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T>> {
  const res = await anthropic().messages.parse({
    model: SMALL_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(schema) },
  });
  console.log(`[small] input=${res.usage.input_tokens} output=${res.usage.output_tokens}`);
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`small model returned ${res.stop_reason}`);
  return res.parsed_output as z.infer<T>;
}
