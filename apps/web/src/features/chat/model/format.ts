import type { Usage } from "@/api/types";

/** A token count as people read it: 517, 12.2K, 253K, 1.2M. */
export function formatTokens(value: number): string {
  const scaled = (n: number) =>
    n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`;
  return `${scaled(value / 1_000_000)}M`;
}

/** Output speed in tokens per second: whole from ten up, else one decimal. */
export function formatTps(tps: number): string {
  const clamped = Math.max(0, tps);
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
}

/** Prompt-side tokens: fresh input, cache reads and cache writes. */
export function promptTokens(usage: Usage): number {
  return usage.input + usage.cache_read + usage.cache_write;
}

/** Every token a usage counts: the prompt side and the output. */
export function totalTokens(usage: Usage): number {
  return promptTokens(usage) + usage.output;
}

/**
 * The share of prompt tokens served from cache, as percent text: whole
 * numbers, with as many decimals as it takes to keep a partial hit below
 * 100. `null` when there were no prompt tokens.
 */
export function cacheHitPercent(usage: Usage): string | null {
  const prompt = promptTokens(usage);
  if (prompt === 0) return null;
  if (usage.cache_read >= prompt) return "100";
  const share = (usage.cache_read / prompt) * 100;
  for (let places = 0; places < 10; places++) {
    const factor = 10 ** places;
    const rounded = Math.round(share * factor) / factor;
    if (rounded < 100) return String(rounded);
  }
  return "99.9";
}

/** How much of the context window the latest prompt used, as a whole
 * percent of at least 1; `null` when the window is unknown. */
export function contextPercent(contextTokens: number, contextWindow: number | null): number | null {
  if (!contextWindow) return null;
  return Math.max(1, Math.round((contextTokens / contextWindow) * 100));
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A message's time: HH:MM today, with the date on earlier days and the
 * year in earlier years. */
export function formatClock(time: number, now: number = Date.now()): string {
  const at = new Date(time);
  const today = new Date(now);
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (at.toDateString() === today.toDateString()) return clock;
  const date = `${MONTHS[at.getMonth()]} ${at.getDate()}`;
  if (at.getFullYear() === today.getFullYear()) return `${date}, ${clock}`;
  return `${date}, ${at.getFullYear()}, ${clock}`;
}
