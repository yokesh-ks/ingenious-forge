/** The session's recorded events as table rows: the raw log, grouped by
 * turn and step, and the chat's own parts. */

import type { JsonValue, SessionEnvelope } from "@/api/types";

export type LogMode = "raw" | "chat";

export interface LogRow {
  key: string;
  /** What the Index column shows. */
  index: string;
  seq: number;
  type: string;
  location: string;
  ts: number;
  preview: string;
  value: JsonValue;
  depth: number;
  parent: string | null;
  /** The chat element this row belongs to. */
  turn: number | null;
  callId: string | null;
}

const PREVIEW_LIMIT = 240;
/** Fields the table's other columns already show. */
const HIDDEN = new Set(["type", "seq", "sequence", "ts", "time", "session_id"]);
/** Only the piece that arrived matters for these. */
const DELTA_FIELDS: Record<string, string> = {
  reasoning_delta: "chunk",
  output: "chunk",
  tool_output: "text",
};

function preview(value: unknown, depth: number): string {
  if (typeof value === "string") return value.slice(0, 180);
  if (value === null || typeof value !== "object") return String(value);
  if (depth > 1) return Array.isArray(value) ? `[${value.length}]` : "{…}";
  const entries = Object.entries(value).filter(([key]) => depth > 0 || !HIDDEN.has(key));
  if (entries.length === 1) return preview(entries[0][1], depth + 1);
  return entries
    .slice(0, 5)
    .map(([key, item]) => `${key}: ${preview(item, depth + 1)}`)
    .join(" · ")
    .slice(0, PREVIEW_LIMIT);
}

/** One line of a record's data, without what other columns show. */
export function logPreview(event: SessionEnvelope): string {
  const field = DELTA_FIELDS[event.type];
  const data = event as unknown as Record<string, unknown>;
  return field && typeof data[field] === "string"
    ? (data[field] as string).slice(0, 180)
    : preview(event, 0);
}

function field<T>(event: SessionEnvelope, name: string): T | null {
  return ((event as unknown as Record<string, unknown>)[name] as T | undefined) ?? null;
}

function makeRow(event: SessionEnvelope, parent: LogRow | null, inherited: number | null): LogRow {
  const turn = field<number>(event, "turn") ?? inherited;
  const step = field<number>(event, "step");
  return {
    key: `event:${event.seq}`,
    index: String(event.seq),
    seq: event.seq,
    type: event.type,
    // A record without its own step happened in the step it sits under.
    location:
      turn === null
        ? ""
        : step === null
          ? parent?.type === "step_started"
            ? parent.location
            : String(turn)
          : `${turn}/${step}`,
    ts: event.ts,
    preview: logPreview(event),
    value: event as unknown as JsonValue,
    depth: parent ? parent.depth + 1 : 0,
    parent: parent?.key ?? null,
    turn,
    callId: field<string>(event, "call_id"),
  };
}

/** Every record, between its turn's and step's start and end. Records
 * outside a loaded range stay ungrouped; none are invented or reordered. */
export function rawRows(events: SessionEnvelope[]): LogRow[] {
  let turn: LogRow | null = null;
  let step: LogRow | null = null;
  return events.map((event) => {
    const inherited = turn?.turn ?? null;
    switch (event.type) {
      case "turn_started":
        step = null;
        turn = makeRow(event, null, null);
        return turn;
      case "step_started":
        step = makeRow(event, turn, inherited);
        return step;
      case "step_ended": {
        const row = makeRow(event, step ?? turn, inherited);
        step = null;
        return row;
      }
      case "turn_ended": {
        const row = makeRow(event, turn, inherited);
        turn = null;
        step = null;
        return row;
      }
      default:
        return makeRow(event, step ?? turn, inherited);
    }
  });
}

const blocksOf = (event: SessionEnvelope) =>
  (field<{ type?: string; text?: string }[]>(event, "content") ?? []).filter(
    (block) => block !== null && typeof block === "object",
  );

interface ChatNodeInput {
  key: string;
  type: string;
  event: SessionEnvelope;
  value: JsonValue;
  location: string;
  depth?: number;
  parent?: string | null;
  turn: number | null;
  callId?: string | null;
}

function chatRow(input: ChatNodeInput): LogRow {
  const { key, type, event, value, location, turn } = input;
  return {
    key,
    index: key,
    seq: event.seq,
    type,
    location,
    ts: event.ts,
    preview: preview(value, 0),
    value,
    depth: input.depth ?? 0,
    parent: input.parent ?? null,
    turn,
    callId: input.callId ?? null,
  };
}

/** The chat as its parts: prompts, messages, each turn's process, each
 * step's reasoning and response, and its tool calls in a group. */
export function chatRows(events: SessionEnvelope[]): LogRow[] {
  const rows: LogRow[] = [];
  const reasoned = new Set<string>();
  const groups = new Map<string, LogRow>();
  const calls = new Map<string, LogRow>();
  const asJson = (event: SessionEnvelope) => event as unknown as JsonValue;

  events.forEach((event, position) => {
    const turn = field<number>(event, "turn");
    const step = field<number>(event, "step");
    const place = `${turn}:${step}`;
    const location = `${turn}/${step}`;
    switch (event.type) {
      case "system_prompt":
        rows.push(
          chatRow({
            key: `system-message${event.seq}`,
            type: "system-prompt",
            event,
            value: asJson(event),
            location: "",
            turn: null,
          }),
        );
        break;
      case "user_message": {
        // The turn this message starts comes just after it in the log.
        const next = events.slice(position).find((e) => e.type === "turn_started");
        const started = next ? field<number>(next, "turn") : null;
        rows.push(
          chatRow({
            key: `input-message${event.seq}`,
            type: "user",
            event,
            value: asJson(event),
            location: started === null ? "" : `${started}/1`,
            turn: started,
          }),
        );
        break;
      }
      case "turn_started":
        rows.push(
          chatRow({
            key: `turn-process${turn}`,
            type: "turn-process",
            event,
            value: asJson(event),
            location: String(turn),
            turn,
          }),
        );
        break;
      case "reasoning_delta":
        reasoned.add(place);
        break;
      case "assistant_message": {
        const blocks = blocksOf(event);
        const parts = [
          ...(reasoned.has(place) || blocks.some((b) => /reason|think/.test(b.type ?? ""))
            ? ["reasoning"]
            : []),
          ...(blocks.some((b) => b.type === "text") ? ["response"] : []),
        ];
        for (const part of parts) {
          rows.push(
            chatRow({
              key: `assistant-step${place}#${part}`,
              type: "assistant-step",
              event,
              value: asJson(event),
              location,
              turn,
            }),
          );
        }
        break;
      }
      case "tool_call": {
        const callId = field<string>(event, "call_id") ?? "";
        let group = groups.get(place);
        if (!group) {
          group = chatRow({
            key: `process:${callId}`,
            type: "group",
            event,
            value: { members: [], data: { turn, step } },
            location: "",
            turn,
          });
          groups.set(place, group);
          rows.push(group);
        }
        const members = (group.value as { members: JsonValue[] }).members;
        members.push({ kind: "tool-call", id: callId });
        group.preview = preview(group.value, 0);
        const call = chatRow({
          key: `tool-call${callId}`,
          type: "tool-call",
          event,
          value: { call: asJson(event), result: null },
          location,
          depth: 1,
          parent: group.key,
          turn,
          callId,
        });
        calls.set(callId, call);
        rows.push(call);
        break;
      }
      case "tool_result": {
        const call = calls.get(field<string>(event, "call_id") ?? "");
        if (call) (call.value as { result: JsonValue }).result = asJson(event);
        break;
      }
      default:
        break;
    }
  });
  return rows;
}

export interface FilteredRows {
  rows: LogRow[];
  /** Keys of rows that really match; the others are shown for context. */
  matches: Set<string>;
}

/** The rows whose type contains `fragment`, with their ancestors. */
export function filterRows(rows: LogRow[], fragment: string): FilteredRows {
  const query = fragment.trim().toLowerCase();
  if (!query) return { rows, matches: new Set(rows.map((r) => r.key)) };
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const matches = new Set(
    rows.filter((row) => row.type.toLowerCase().includes(query)).map((r) => r.key),
  );
  const keep = new Set<string>();
  for (const key of matches) {
    for (let at = byKey.get(key); at && !keep.has(at.key); ) {
      keep.add(at.key);
      at = at.parent ? byKey.get(at.parent) : undefined;
    }
  }
  return { rows: rows.filter((row) => keep.has(row.key)), matches };
}

/** Rows not hidden under a folded ancestor. */
export function visibleRows(rows: LogRow[], collapsed: Set<string>): LogRow[] {
  const hidden = new Set<string>();
  return rows.filter((row) => {
    if (row.parent && (hidden.has(row.parent) || collapsed.has(row.parent))) {
      hidden.add(row.key);
      return false;
    }
    return true;
  });
}

export const branches = (rows: LogRow[]) =>
  new Set(rows.map((row) => row.parent).filter((p): p is string => p !== null));

/** A row's ancestors, outermost first. */
export function ancestorsOf(rows: LogRow[], row: LogRow | undefined): LogRow[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: LogRow[] = [];
  for (let at = row?.parent ? byKey.get(row.parent) : undefined; at; ) {
    out.unshift(at);
    at = at.parent ? byKey.get(at.parent) : undefined;
  }
  return out;
}

/** `hh:mm:ss.mmm` in UTC; blank for logs written before times were kept. */
export function logTime(ts: number): string {
  return ts ? new Date(ts).toISOString().slice(11, 23) : "";
}

const TURN_ROWS = new Set(["turn_started", "turn-process"]);

/** The row for a chat element: its tool call, else its turn. */
export function rowForChat(
  rows: LogRow[],
  target: { callId: string | null; turn: number | null },
): LogRow | undefined {
  return (
    rows.find(
      (r) =>
        r.callId !== null &&
        r.callId === target.callId &&
        (r.type === "tool_call" || r.type === "tool-call"),
    ) ?? rows.find((r) => r.turn === target.turn && TURN_ROWS.has(r.type))
  );
}
