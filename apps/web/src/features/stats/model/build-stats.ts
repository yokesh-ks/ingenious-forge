import type { JsonValue, SessionEnvelope, Usage } from "@/api/types";
import { rowDetail } from "@/features/chat/model/build-chat";

/** One tool call a step made. */
export interface ToolStat {
  callId: string;
  name: string;
  /** The row detail the chat shows for it. */
  detail: string;
  args: JsonValue;
  output: string | null;
  /** Characters of its result, which the next request carries. */
  chars: number;
  lines: number;
  /** Call to result; `null` without a result or recorded times. */
  ms: number | null;
}

/** One model request and the tools it called. */
export interface StepStat {
  turn: number;
  step: number;
  /** Logged times in ms since the epoch; `null` when unknown. */
  startedAt: number | null;
  endedAt: number | null;
  firstTokenMs: number | null;
  generationMs: number | null;
  usage: Usage | null;
  tools: ToolStat[];
  /** The text the model wrote in this step, if any. */
  answer: string | null;
}

/** A record that is not a step: a prompt, request or setting change. */
export interface EventStat {
  label: string;
  /** What changed, such as a provider and model. */
  subject: string;
  /** A short description, such as its size. */
  detail: string;
  at: number | null;
}

export type TurnRow = { kind: "step"; step: StepStat } | { kind: "event"; event: EventStat };

export interface TurnStat {
  turn: number;
  /** The user's message that started it. */
  trigger: string | null;
  startedAt: number | null;
  endedAt: number | null;
  steps: StepStat[];
  /** Steps and event rows in log order; an event logged during a step
   * follows that step's row. */
  rows: TurnRow[];
}

const known = (ts: number) => (ts > 0 ? ts : null);

/** The text blocks of an assistant message's content. */
function textOf(content: JsonValue[]): string | null {
  const text = content
    .flatMap((block) =>
      block &&
      typeof block === "object" &&
      !Array.isArray(block) &&
      block.type === "text" &&
      typeof block.text === "string"
        ? [block.text]
        : [],
    )
    .join("");
  return text.trim() === "" ? null : text;
}

/** A character count: "943 chars", "6.1K chars". */
export function formatChars(count: number): string {
  return count < 1000 ? `${count} chars` : `${(count / 1000).toFixed(1)}K chars`;
}

const chars = (text: string) => formatChars(text.length);

/** The event row an event makes, or `null` for events that are not rows. */
function eventRow(envelope: SessionEnvelope): EventStat | null {
  const at = known(envelope.ts);
  switch (envelope.type) {
    case "system_prompt":
      return { label: "System prompt", subject: "set", detail: chars(envelope.text), at };
    case "request_header":
      return {
        label: "Request header",
        subject: `${envelope.provider} / ${envelope.model}`,
        detail: `${envelope.reason.replace("_", " ")} · ${envelope.tools.length} tools`,
        at,
      };
    case "request_context":
      return {
        label: "Request context",
        subject: `${envelope.provider} / ${envelope.model}`,
        detail:
          envelope.context_window === null
            ? "context window unknown"
            : `${formatKTokens(envelope.context_window)} context window`,
        at,
      };
    case "model_changed":
      return {
        label: "Model changed",
        subject: `${envelope.to.provider} / ${envelope.to.model}`,
        detail: envelope.from ? `from ${envelope.from.provider} / ${envelope.from.model}` : "",
        at,
      };
    case "approval_mode_changed":
      return { label: "Approval mode", subject: envelope.mode.replace("_", "-"), detail: "", at };
    case "sandbox_changed":
      return {
        label: "Sandbox",
        subject: envelope.sandbox.name,
        detail: `${envelope.sandbox.writable.length} writable · network ${envelope.sandbox.network ? "on" : "off"}`,
        at,
      };
    default:
      return null;
  }
}

/**
 * The session's turns with their steps, tools and event rows, from its
 * logged events in order. Pure, so the Statistics view can rebuild it as
 * events arrive.
 */
export function buildStats(events: SessionEnvelope[]): TurnStat[] {
  const turns: TurnStat[] = [];
  const calls = new Map<string, ToolStat>();
  let lastHuman: string | null = null;
  let turn: TurnStat | null = null;
  let step: StepStat | null = null;
  // Event rows logged during a step wait until the step's row is placed.
  let pending: EventStat[] = [];

  const flushStep = () => {
    if (turn && step) {
      turn.rows.push({ kind: "step", step });
      for (const event of pending) turn.rows.push({ kind: "event", event });
    }
    step = null;
    pending = [];
  };

  for (const envelope of events) {
    switch (envelope.type) {
      case "user_message":
        if (envelope.source !== "steering") lastHuman = envelope.text;
        continue;
      case "turn_started":
        flushStep();
        turn = {
          turn: envelope.turn,
          trigger: lastHuman,
          startedAt: known(envelope.ts),
          endedAt: null,
          steps: [],
          rows: [],
        };
        turns.push(turn);
        continue;
      case "step_started":
        flushStep();
        if (!turn) continue;
        step = {
          turn: envelope.turn,
          step: envelope.step,
          startedAt: known(envelope.ts),
          endedAt: null,
          firstTokenMs: null,
          generationMs: null,
          usage: null,
          tools: [],
          answer: null,
        };
        turn.steps.push(step);
        continue;
      case "assistant_message":
        if (step) step.answer = textOf(envelope.content) ?? step.answer;
        continue;
      case "tool_call": {
        const call: ToolStat = {
          callId: envelope.call_id,
          name: envelope.name,
          detail: rowDetail(envelope.args).text,
          args: envelope.args,
          output: null,
          chars: 0,
          lines: 0,
          ms: null,
        };
        calls.set(envelope.call_id, call);
        step?.tools.push(call);
        continue;
      }
      case "tool_result": {
        const call = calls.get(envelope.call_id);
        if (!call) continue;
        call.output = envelope.output;
        call.chars = envelope.output.length;
        call.lines = envelope.output === "" ? 0 : envelope.output.split("\n").length;
        call.ms = envelope.started_at > 0 ? envelope.ended_at - envelope.started_at : null;
        continue;
      }
      case "step_ended":
        if (step) {
          step.endedAt = known(envelope.ts);
          step.firstTokenMs = envelope.first_token_ms;
          step.generationMs = envelope.generation_ms;
          step.usage = envelope.usage;
        }
        flushStep();
        continue;
      case "turn_ended":
      case "done":
      case "interrupted":
        flushStep();
        if (turn) turn.endedAt = known(envelope.ts);
        turn = null;
        continue;
      default: {
        const row = eventRow(envelope);
        if (!row || !turn) continue;
        if (step) pending.push(row);
        else turn.rows.push({ kind: "event", event: row });
      }
    }
  }
  flushStep();
  return turns;
}

/** Prompt size: fresh input, cache reads and cache writes. */
export function contextTokens(usage: Usage): number {
  return usage.input + usage.cache_read + usage.cache_write;
}

/** Cache reads as a share of the prompt, to two decimals; `null` without
 * prompt tokens. */
export function cacheHit(usage: Usage): string | null {
  const prompt = contextTokens(usage);
  if (prompt === 0) return null;
  return `${((usage.cache_read / prompt) * 100).toFixed(2)}%`;
}

export interface Timing {
  firstTokenMs: number | null;
  generationMs: number | null;
  modelMs: number | null;
  toolMs: number | null;
  totalMs: number | null;
  /** The part of the total that is neither model nor tool time. */
  otherMs: number | null;
  /** Output tokens per second of generation. */
  tps: number | null;
}

const sum = (values: (number | null)[]): number | null =>
  values.some((v) => v !== null) ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null;

/** A step's time split and output speed. */
export function stepTiming(step: StepStat): Timing {
  const modelMs = sum([step.firstTokenMs, step.generationMs]);
  const timed = step.tools.filter((t) => t.ms !== null);
  const toolMs = timed.length > 0 ? sum(timed.map((t) => t.ms)) : null;
  const totalMs =
    step.startedAt !== null && step.endedAt !== null ? step.endedAt - step.startedAt : null;
  return {
    firstTokenMs: step.firstTokenMs,
    generationMs: step.generationMs,
    modelMs,
    toolMs,
    totalMs,
    otherMs: totalMs === null ? null : Math.max(0, totalMs - (modelMs ?? 0) - (toolMs ?? 0)),
    tps:
      step.usage && step.generationMs && step.usage.output > 0
        ? step.usage.output / (step.generationMs / 1000)
        : null,
  };
}

export interface TurnTotals extends Timing {
  /** The turn's summed usage; `null` when no step reported any. */
  usage: Usage | null;
  /** The latest step's prompt, or every step's prompts added up. */
  context: number | null;
  output: number | null;
}

/** A turn's figures: sums over its steps, speed over all generation, and
 * its context as the latest step's or the sum of all. */
export function turnTotals(turn: TurnStat, basis: "latest" | "cumulative"): TurnTotals {
  const timings = turn.steps.map(stepTiming);
  const used = turn.steps.flatMap((s) => (s.usage ? [s.usage] : []));
  const usage =
    used.length === 0
      ? null
      : used.reduce((a, u) => ({
          input: a.input + u.input,
          output: a.output + u.output,
          cache_read: a.cache_read + u.cache_read,
          cache_write: a.cache_write + u.cache_write,
        }));
  const generationMs = sum(timings.map((t) => t.generationMs));
  const decodeTokens = turn.steps.reduce(
    (a, s) => a + (s.usage && s.generationMs ? s.usage.output : 0),
    0,
  );
  const firstTokenMs = sum(timings.map((t) => t.firstTokenMs));
  const modelMs = sum(timings.map((t) => t.modelMs));
  const toolMs = sum(timings.map((t) => t.toolMs));
  const totalMs =
    turn.startedAt !== null && turn.endedAt !== null
      ? turn.endedAt - turn.startedAt
      : sum(timings.map((t) => t.totalMs));
  const last = [...used].reverse()[0];
  return {
    usage,
    context:
      used.length === 0
        ? null
        : basis === "latest"
          ? contextTokens(last)
          : used.reduce((a, u) => a + contextTokens(u), 0),
    output: usage ? usage.output : null,
    firstTokenMs,
    generationMs,
    modelMs,
    toolMs,
    totalMs,
    otherMs: totalMs === null ? null : Math.max(0, totalMs - (modelMs ?? 0) - (toolMs ?? 0)),
    tps: generationMs && decodeTokens > 0 ? decodeTokens / (generationMs / 1000) : null,
  };
}

/** A duration: "864 ms", "2.27 s", "1.2 min"; a dash when unknown. */
export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

/** Tokens in thousands: two decimals below 1K, else one. */
export function formatKTokens(tokens: number): string {
  const k = tokens / 1000;
  return `${k < 1 ? k.toFixed(2) : k.toFixed(1)}K`;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A logged time as "MM-DD HH:MM", with seconds and ms when `precise`. */
export function formatClockMs(ts: number, precise: boolean): string {
  const d = new Date(ts);
  const base = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return precise ? `${base}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` : base;
}
