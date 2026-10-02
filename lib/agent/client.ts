import Anthropic from "@anthropic-ai/sdk";

// Server-only. The key comes from ANTHROPIC_API_KEY in .env.local and never reaches the browser.
const g = globalThis as typeof globalThis & { __anthropic?: Anthropic };
export const anthropic = (): Anthropic => (g.__anthropic ??= new Anthropic());

/**
 * The story lanes. Sonnet 5.5 because lanes must run at once: measured on
 * 2026-10-01, four Fable 5.1 calls with server tools ran one after another
 * (63s) where four Sonnet 5.5 calls ran in parallel (13s).
 */
export const STORIES_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** The small calls: the creator-video filter and the two "more like this" steps. */
export const SMALL_MODEL = "claude-haiku-4-5-20251001";
