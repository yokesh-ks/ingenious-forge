import type { JsonValue, MessageSource, SessionEnvelope, ToolSchema, Usage } from "@/api/types";

/**
 * The Trajectory view's projection of a session log: one record per thing
 * that happened, in log order. Pure, so the view rebuilds it as events
 * arrive.
 */

export type RecordKind = "system" | "user" | "context" | "assistant" | "tool";

interface Base {
  /** Stable id, also used in the URL (`?record=`). */
  id: string;
  turn: number | null;
  step: number | null;
  /** Logged time in ms since the epoch; `null` when unknown. */
  at: number | null;
  /** One line for the ledger. */
  preview: string;
}

export interface SystemRecord extends Base {
  kind: "system";
  text: string;
  /** The tools offered with this prompt, from the latest request header. */
  tools: ToolSchema[];
}

export interface UserRecord extends Base {
  kind: "user";
  text: string;
  source: MessageSource;
}

export interface ContextRecord extends Base {
  kind: "context";
  /** Where the context came from, such as an instruction file's path. */
  source: string;
  text: string;
}

export type Block =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool-call"; name: string; text: string };

export interface AssistantRecord extends Base {
  kind: "assistant";
  /** The model request that produced it, numbered across the session. */
  request: number;
  blocks: Block[];
  provider: string;
  model: string;
  maxTokens: number | null;
  startedAt: number | null;
  endedAt: number | null;
  firstTokenMs: number | null;
  generationMs: number | null;
  usage: Usage | null;
  toolCalls: number;
}

export type ToolStatus = "pending" | "completed" | "failed";

export interface ToolRecord extends Base {
  kind: "tool";
  callId: string;
  name: string;
  args: JsonValue;
  output: string | null;
  /** The structured result for the UI, as logged. */
  meta: JsonValue | null;
  status: ToolStatus;
  startedAt: number | null;
  endedAt: number | null;
  /** The reply that made the call. */
  parentId: string | null;
  schema: ToolSchema | null;
}

export type TrajectoryRecord =
  | SystemRecord
  | UserRecord
  | ContextRecord
  | AssistantRecord
  | ToolRecord;

export interface Trajectory {
  records: TrajectoryRecord[];
}

const known = (ts: number) => (ts > 0 ? ts : null);

const PREVIEW_SOURCE = 2_048;
const PREVIEW_OUTPUT = 512;

/** Markdown as one plain line for the ledger: marks, links and list
 * markers dropped, at most 512 characters, "…" when cut. Reads only the
 * first 2,048 characters, so a long record costs no more than a short one. */
export function previewText(text: string): string {
  const source = text.slice(0, PREVIEW_SOURCE);
  const plain = source
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1");
  const compact = plain.replace(/\s+/g, " ").trim();
  const preview = compact.slice(0, PREVIEW_OUTPUT).trimEnd();
  return source.length < text.length || preview.length < compact.length ? `${preview}…` : preview;
}

const oneLine = previewText;

const fieldsOf = (value: JsonValue): Record<string, JsonValue> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;

/** An assistant message's content as typed blocks. */
function blocksOf(content: JsonValue[]): Block[] {
  return content.flatMap((raw): Block[] => {
    const block = fieldsOf(raw);
    if (!block) return [];
    const text = (key: string) => (typeof block[key] === "string" ? (block[key] as string) : "");
    switch (block.type) {
      case "thinking":
      case "reasoning":
        return [{ type: "thinking", text: text("thinking") || text("text") }];
      case "text":
        return [{ type: "text", text: text("text") }];
      case "tool_use":
        return [{ type: "tool-call", name: text("name"), text: JSON.stringify(block.input ?? {}) }];
      default:
        return [];
    }
  });
}

/** The instruction files a system prompt carries, with their text. */
function instructionsOf(text: string): { path: string; text: string }[] {
  return [
    ...text.matchAll(
      /<project_instructions path="([^"]+)">\n?([\s\S]*?)\n?<\/project_instructions>/g,
    ),
  ].map((m) => ({ path: m[1], text: m[2] }));
}

/** Where the turn's opening message sits, or -1 once the turn has a reply. */
function openingOf(records: TrajectoryRecord[], turn: number | null): number {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record.kind === "assistant") return -1;
    if (record.kind === "user" && record.source === "human") {
      return record.turn === turn ? i : -1;
    }
  }
  return -1;
}

/** Folds a session's events into Trajectory records. */
export function buildTrajectory(events: SessionEnvelope[]): Trajectory {
  const records: TrajectoryRecord[] = [];
  const tools = new Map<string, ToolRecord>();
  let schemas: ToolSchema[] = [];
  let provider = "";
  let model = "";
  let maxTokens: number | null = null;
  let turn: number | null = null;
  let step: number | null = null;
  let request = 0;
  let stepStart: number | null = null;
  let reply: AssistantRecord | null = null;
  let systems = 0;
  // A message logged before its turn started belongs to that turn.
  let waiting: UserRecord[] = [];

  for (const envelope of events) {
    const at = known(envelope.ts);
    switch (envelope.type) {
      case "session_started":
        provider = envelope.provider;
        model = envelope.model;
        continue;
      case "user_message": {
        const user: UserRecord = {
          kind: "user",
          id: `user:${envelope.seq}`,
          turn,
          step: null,
          at,
          preview: oneLine(envelope.text),
          text: envelope.text,
          source: envelope.source,
        };
        records.push(user);
        waiting.push(user);
        continue;
      }
      case "turn_started":
        turn = envelope.turn;
        step = null;
        for (const user of waiting) {
          if (user.source === "human") user.turn = envelope.turn;
        }
        continue;
      case "step_started":
        step = envelope.step;
        stepStart = at;
        reply = null;
        for (const user of waiting) {
          user.turn ??= turn;
          user.step = envelope.step;
        }
        waiting = [];
        continue;
      case "request_header":
        provider = envelope.provider;
        model = envelope.model;
        maxTokens = envelope.max_tokens;
        schemas = envelope.tools;
        for (const record of records) {
          if (record.kind === "system" && record.tools.length === 0) record.tools = schemas;
        }
        continue;
      case "model_changed":
        provider = envelope.to.provider;
        model = envelope.to.model;
        continue;
      case "system_prompt": {
        systems += 1;
        const system: SystemRecord = {
          kind: "system",
          id: `system:${envelope.seq}`,
          turn,
          step,
          at,
          preview: systems === 1 ? "Initial System Prompt" : "System Prompt Updated",
          text: envelope.text,
          tools: schemas,
        };
        // A prompt set before the turn's first reply heads the turn; one
        // that changes during the turn stays where it happened.
        const opening = openingOf(records, turn);
        if (opening === -1) records.push(system);
        else records.splice(opening, 0, system);
        for (const file of instructionsOf(envelope.text)) {
          records.push({
            kind: "context",
            id: `context:${envelope.seq}:${file.path}`,
            turn,
            step,
            at,
            preview: oneLine(file.text),
            source: file.path,
            text: file.text,
          });
        }
        continue;
      }
      case "assistant_message": {
        request += 1;
        const blocks = blocksOf(envelope.content);
        const text = blocks
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join(" ");
        reply = {
          kind: "assistant",
          // Turn and step, not the running count: loading older history renumbers
          // requests but must not change what an id points to.
          id: `reply:${envelope.turn}.${envelope.step}`,
          turn: envelope.turn,
          step: envelope.step,
          at,
          preview: oneLine(text) || "(tool call only)",
          request,
          blocks,
          provider: envelope.provider || provider,
          model: envelope.model || model,
          maxTokens,
          startedAt: stepStart,
          endedAt: null,
          firstTokenMs: null,
          generationMs: null,
          usage: envelope.usage,
          toolCalls: blocks.filter((b) => b.type === "tool-call").length,
        };
        records.push(reply);
        continue;
      }
      case "tool_call": {
        const record: ToolRecord = {
          kind: "tool",
          id: `tool:${envelope.call_id}`,
          turn: envelope.turn,
          step: envelope.step,
          at,
          preview: `${envelope.name} ${JSON.stringify(envelope.args)}`,
          callId: envelope.call_id,
          name: envelope.name,
          args: envelope.args,
          output: null,
          meta: null,
          status: "pending",
          startedAt: at,
          endedAt: null,
          parentId: reply?.id ?? null,
          schema: schemas.find((s) => s.name === envelope.name) ?? null,
        };
        tools.set(envelope.call_id, record);
        records.push(record);
        continue;
      }
      case "tool_result": {
        const record = tools.get(envelope.call_id);
        if (!record) continue;
        record.output = envelope.output;
        record.meta = envelope.meta;
        record.status = envelope.is_error ? "failed" : "completed";
        if (envelope.started_at > 0) record.startedAt = envelope.started_at;
        record.endedAt = envelope.ended_at > 0 ? envelope.ended_at : at;
        record.preview = `${record.name} ${JSON.stringify(record.args)} → ${oneLine(envelope.output)}`;
        continue;
      }
      case "step_ended":
        if (reply && reply.step === envelope.step && reply.turn === envelope.turn) {
          reply.endedAt = at;
          reply.firstTokenMs = envelope.first_token_ms;
          reply.generationMs = envelope.generation_ms;
          reply.usage = envelope.usage ?? reply.usage;
        }
        continue;
      default:
        continue;
    }
  }
  return { records };
}

/** The id that selects the model request behind a reply. */
export const requestIdOf = (reply: AssistantRecord) => reply.id.replace(/^reply:/, "request:");

/** The usage of every request up to and including `request`. */
export function sessionUsageUpTo(records: TrajectoryRecord[], request: number): Usage {
  const sum: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  for (const record of records) {
    if (record.kind !== "assistant" || record.request > request || !record.usage) continue;
    sum.input += record.usage.input;
    sum.output += record.usage.output;
    sum.cache_read += record.usage.cache_read;
    sum.cache_write += record.usage.cache_write;
  }
  return sum;
}

/** How long the model took on a reply: its wait for the first token plus
 * generation. The step's own span also holds its tools and approvals, so it
 * is only the fallback when those two were not recorded. */
export function replyDuration(reply: AssistantRecord): number | null {
  if (reply.firstTokenMs !== null || reply.generationMs !== null) {
    return (reply.firstTokenMs ?? 0) + (reply.generationMs ?? 0);
  }
  return reply.startedAt !== null && reply.endedAt !== null
    ? reply.endedAt - reply.startedAt
    : null;
}

/** All of a record's text, for search. */
function searchText(record: TrajectoryRecord): string {
  switch (record.kind) {
    case "system":
      return `${record.preview}\n${record.text}`;
    case "user":
    case "context":
      return record.text;
    case "assistant":
      return record.blocks
        .map((b) => (b.type === "tool-call" ? `${b.name} ${b.text}` : b.text))
        .join("\n");
    case "tool":
      return `${record.name} ${JSON.stringify(record.args)}\n${record.output ?? ""}`;
  }
}

/** Whether a record's text holds the query, ignoring case. */
export function matchesSearch(record: TrajectoryRecord, query: string): boolean {
  return searchText(record).toLowerCase().includes(query.trim().toLowerCase());
}

export type LedgerRow =
  | { type: "record"; key: string; record: TrajectoryRecord; turnStart: boolean }
  | { type: "calls"; key: string; summary: string; parentId: string }
  | { type: "turn"; key: string; summary: string; turn: number };

export interface LedgerOptions {
  /** Fold each turn after its message. */
  turns: boolean;
  /** Fold each reply's tool calls. */
  calls: boolean;
  query: string;
  /** Groups the user folded or opened one by one, against the toggles
   * above, by row key (`turn:N`, `calls:<reply id>`). */
  flipped?: Set<string>;
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The ledger's rows: records with folded groups replaced by a summary
 * row, narrowed to a search when one is typed. */
export function ledgerRows(records: TrajectoryRecord[], options: LedgerOptions): LedgerRow[] {
  const flipped = options.flipped ?? new Set<string>();
  const query = options.query.trim();
  if (query !== "") {
    const byId = new Map(records.map((r) => [r.id, r]));
    const keep = new Set<string>();
    for (const record of records) {
      if (!matchesSearch(record, query)) continue;
      keep.add(record.id);
      if (record.kind === "tool" && record.parentId && byId.has(record.parentId)) {
        keep.add(record.parentId);
      }
    }
    return records
      .filter((r) => keep.has(r.id))
      .map((record) => ({ type: "record", key: record.id, record, turnStart: false }));
  }

  const rows: LedgerRow[] = [];
  const seenTurns = new Set<number>();
  let i = 0;
  while (i < records.length) {
    const record = records[i];
    const turnStart = record.kind === "user" && record.turn !== null && !seenTurns.has(record.turn);
    if (turnStart && record.turn !== null) seenTurns.add(record.turn);
    rows.push({ type: "record", key: record.id, record, turnStart });
    i += 1;

    if (turnStart && record.turn !== null && options.turns !== flipped.has(`turn:${record.turn}`)) {
      const key = `turn:${record.turn}`;
      const turn = record.turn;
      let end = i;
      const nextTurn = (r: TrajectoryRecord) =>
        r.kind === "user" && r.source === "human" && r.turn !== turn;
      while (end < records.length && !nextTurn(records[end])) end += 1;
      if (end > i) {
        const inside = records.slice(i, end);
        const steps = new Set(inside.flatMap((r) => (r.kind === "assistant" ? [r.step] : [])));
        const calls = inside.filter((r) => r.kind === "tool").length;
        rows.push({
          type: "turn",
          key,
          turn,
          summary: `${plural(steps.size, "step")} · ${plural(calls, "tool call")}`,
        });
        i = end;
        continue;
      }
    }

    if (record.kind === "assistant" && options.calls !== flipped.has(`calls:${record.id}`)) {
      const key = `calls:${record.id}`;
      let end = i;
      const call = (r: TrajectoryRecord) => r.kind === "tool" && r.parentId === record.id;
      while (end < records.length && call(records[end])) end += 1;
      if (end > i) {
        const calls = records.slice(i, end) as ToolRecord[];
        const names = [...new Set(calls.map((c) => c.name))].join(", ");
        rows.push({
          type: "calls",
          key,
          parentId: record.id,
          summary: `${plural(calls.length, "tool call")} · ${names}`,
        });
        i = end;
      }
    }
  }
  return rows;
}
