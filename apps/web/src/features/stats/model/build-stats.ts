import type { ApprovalDecision, JsonValue, SessionEnvelope, Usage } from "@/api/types";

/** Text kept for an answer or a tool result in a step's details. */
export const TEXT_LIMIT = 16_000;

/** One tool call a step made. */
export interface ToolStat {
  callId: string;
  name: string;
  /** Its target, cut to fit a table cell: a description, short path,
   * pattern or address; `null` when the call names none. */
  hint: string | null;
  args: JsonValue;
  /** The result's first {@link TEXT_LIMIT} characters. */
  output: string | null;
  /** Whether the result was longer than what `output` keeps. */
  truncated: boolean;
  /** Characters of its result, which the next request carries. */
  chars: number;
  lines: number;
  /** Call to result; `null` without a result or recorded times. */
  ms: number | null;
  isError: boolean;
  /** An edit's or write's line counts and own diff. */
  added: number | null;
  removed: number | null;
  diff: string | null;
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

/** How a turn ended, or that it has not yet. */
export type TurnState = "running" | "completed" | "interrupted" | "failed";

export interface TurnStat {
  turn: number;
  state: TurnState;
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

const fieldsOf = (value: JsonValue | null): Record<string, JsonValue> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;

/** Text cut to one line of at most `max` characters, ending in "…". */
function clip(text: string | null, max: number): string | null {
  if (text === null) return null;
  const value = text.trim().replace(/\s+/g, " ");
  if (value === "") return null;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** A path's last two segments; a full path adds nothing to a table cell. */
function shortPath(value: string | null): string | null {
  if (value === null) return null;
  const parts = value.split(/[\\/]/).filter((part) => part !== "");
  return parts.length <= 2 ? value : parts.slice(-2).join("/");
}

/** A call's target as the Execution cell shows it. */
export function toolHint(name: string, args: JsonValue): string | null {
  const fields = fieldsOf(args) ?? {};
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = fields[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return null;
  };
  switch (name) {
    case "read":
    case "write":
    case "edit":
      return clip(shortPath(pick("file_path", "path", "file")), 34);
    case "grep":
    case "glob": {
      const pattern = pick("pattern");
      if (pattern === null) return null;
      const include = pick("include");
      return clip(include === null ? pattern : `${pattern} (${include})`, 34);
    }
    case "bash":
      return clip((pick("description") ?? pick("command") ?? "").split("\n")[0], 30);
    case "web_fetch": {
      const url = pick("url");
      return url === null ? null : clip(url.replace(/^https?:\/\//, ""), 34);
    }
    default:
      return clip(pick("description", "query", "path", "file_path", "name"), 30);
  }
}

/** Line count; an empty string has none and a final newline adds none. */
export function countLines(text: string): number {
  if (text === "") return 0;
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

/** Calls grouped by tool and target, so "×2" means one target twice. */
export function callGroups(
  tools: ToolStat[],
): { key: string; name: string; hint: string | null; calls: ToolStat[] }[] {
  const groups = new Map<
    string,
    { key: string; name: string; hint: string | null; calls: ToolStat[] }
  >();
  for (const tool of tools) {
    const key = `${tool.name}\u0000${tool.hint ?? ""}`;
    const group = groups.get(key);
    if (group) group.calls.push(tool);
    else groups.set(key, { key, name: tool.name, hint: tool.hint, calls: [tool] });
  }
  return [...groups.values()];
}

/** An answer's first non-empty line, for a one-line preview. */
export function answerPreview(answer: string | null): string | null {
  const line = answer?.split("\n").find((part) => part.trim() !== "");
  return line ? line.trim() : null;
}

export interface CodeLine {
  sign: " " | "+" | "−";
  text: string;
}

/** A unified diff's changed and context lines, without its headers. */
export function diffLines(diff: string): CodeLine[] {
  return diff.split("\n").flatMap((line): CodeLine[] => {
    if (/^(---|\+\+\+|@@|diff |index )/.test(line)) return [];
    if (line.startsWith("+")) return [{ sign: "+", text: line.slice(1) }];
    if (line.startsWith("-")) return [{ sign: "−", text: line.slice(1) }];
    if (line.startsWith(" ")) return [{ sign: " ", text: line.slice(1) }];
    return [];
  });
}

const numberField = (fields: Record<string, JsonValue> | null, key: string) =>
  typeof fields?.[key] === "number" ? (fields[key] as number) : null;

const DECISIONS: Record<ApprovalDecision, string> = {
  approve: "allowed once",
  always_allow: "always allowed",
  deny: "rejected",
};

const REASONS: Record<string, string> = {
  first: "initial",
  model_changed: "model changed",
  tools_changed: "tools changed",
};
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

/** What an approval asked about, by call. */
type Asked = Map<string, { kind: string; target: string }>;

/** The event row an event makes, or `null` for events that are not rows. */
function eventRow(envelope: SessionEnvelope, asked: Asked): EventStat | null {
  const at = known(envelope.ts);
  switch (envelope.type) {
    case "system_prompt":
      return {
        label: "System prompt",
        subject: "set",
        detail: `set · ${formatChars(envelope.text.length)}`,
        at,
      };
    case "request_header":
      return {
        label: "Request header",
        subject: `${envelope.provider} / ${envelope.model}`,
        detail: `${REASONS[envelope.reason] ?? envelope.reason} · ${envelope.tools.length} tools`,
        at,
      };
    case "request_context": {
      const model = `${envelope.provider} / ${envelope.model}`;
      return {
        label: "Request context",
        subject: model,
        detail:
          envelope.context_window === null
            ? `${model} · context window unknown`
            : `${model} · ${formatKTokens(envelope.context_window)} context window`,
        at,
      };
    }
    case "approval_requested": {
      const target = envelope.command ?? envelope.path ?? envelope.kind;
      asked.set(envelope.call_id, { kind: envelope.kind, target });
      return { label: "Approval", subject: envelope.kind, detail: `${target} · waiting`, at };
    }
    case "approval_resolved": {
      const request = asked.get(envelope.call_id);
      return {
        label: "Approval",
        subject: request?.kind ?? "",
        detail: `${request?.target ?? envelope.call_id} · ${DECISIONS[envelope.decision]}`,
        at,
      };
    }
    case "assistant_attempt":
      return {
        label: "Model attempt",
        subject: envelope.error,
        detail: "Model attempt without a committed message",
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
  const asked: Asked = new Map();
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
          state: "running",
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
          hint: toolHint(envelope.name, envelope.args),
          args: envelope.args,
          output: null,
          truncated: false,
          chars: 0,
          lines: 0,
          ms: null,
          isError: false,
          added: null,
          removed: null,
          diff: null,
        };
        calls.set(envelope.call_id, call);
        step?.tools.push(call);
        continue;
      }
      case "tool_result": {
        const call = calls.get(envelope.call_id);
        if (!call) continue;
        const meta = fieldsOf(envelope.meta);
        call.output = envelope.output.slice(0, TEXT_LIMIT);
        call.truncated = envelope.output.length > TEXT_LIMIT;
        call.chars = envelope.output.length;
        call.lines = countLines(envelope.output);
        call.isError = envelope.is_error;
        call.added = numberField(meta, "additions");
        call.removed = numberField(meta, "deletions");
        call.diff = typeof meta?.diff === "string" ? meta.diff : null;
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
        if (turn) {
          turn.endedAt = known(envelope.ts);
          turn.state =
            envelope.type === "interrupted"
              ? "interrupted"
              : envelope.type === "done"
                ? "completed"
                : envelope.reason.kind === "error"
                  ? "failed"
                  : envelope.reason.kind;
        }
        turn = null;
        continue;
      default: {
        const row = eventRow(envelope, asked);
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

/** Tokens in thousands: two decimals below 1K, else one; millions from
 * ten million. */
export function formatKTokens(tokens: number): string {
  if (tokens >= 10_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  const k = tokens / 1000;
  return `${k < 1 ? k.toFixed(2) : k.toFixed(1)}K`;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A logged time of day as "HH:MM:SS", which lines up with logs. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** A logged time as "MM-DD HH:MM", with seconds and ms when `precise`. */
export function formatClockMs(ts: number, precise: boolean): string {
  const d = new Date(ts);
  const base = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return precise ? `${base}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` : base;
}
