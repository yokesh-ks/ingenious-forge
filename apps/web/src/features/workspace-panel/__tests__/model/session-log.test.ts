import { describe, expect, it } from "vitest";
import type { SessionEnvelope } from "@/api/types";
import {
  ancestorsOf,
  branches,
  chatRows,
  filterRows,
  logPreview,
  logTime,
  rawRows,
  rowForChat,
  visibleRows,
} from "../../model/session-log";

let seq = 0;
const event = (type: string, data: object = {}) =>
  ({ seq: ++seq, ts: 1000, type, session_id: "s", ...data }) as unknown as SessionEnvelope;

const turn = () => {
  seq = 0;
  return [
    event("user_message", { text: "hi", source: "human" }),
    event("turn_started", { turn: 1 }),
    event("step_started", { turn: 1, step: 1 }),
    event("reasoning_delta", { turn: 1, step: 1, chunk: "think" }),
    event("assistant_message", { turn: 1, step: 1, text: "ok" }),
    event("tool_call", { turn: 1, step: 1, call_id: "c1", name: "bash" }),
    event("tool_result", { call_id: "c1", output: "done" }),
    event("step_ended", { turn: 1, step: 1 }),
    event("turn_ended", { turn: 1 }),
  ];
};

describe("the raw log", () => {
  it("nests records between their turn and step, ends included", () => {
    const rows = rawRows(turn());
    expect(rows.map((r) => [r.type, r.depth])).toEqual([
      ["user_message", 0],
      ["turn_started", 0],
      ["step_started", 1],
      ["reasoning_delta", 2],
      ["assistant_message", 2],
      ["tool_call", 2],
      ["tool_result", 2],
      ["step_ended", 2],
      ["turn_ended", 1],
    ]);
  });

  it("does not invent a group for a record whose start is not loaded", () => {
    seq = 0;
    const [row] = rawRows([event("tool_result", { call_id: "c" })]);
    expect(row).toMatchObject({ depth: 0, parent: null });
  });

  it("shows where a record happened, inheriting the turn", () => {
    const rows = rawRows(turn());
    expect(rows[5].location).toBe("1/1");
    expect(rows[6].location).toBe("1/1");
    expect(rows[1].location).toBe("1");
  });

  it("previews data without what other columns show", () => {
    seq = 0;
    expect(logPreview(event("error", { message: "boom" }))).toBe("boom");
    expect(logPreview(event("x", { a: 1, b: "two" }))).toBe("a: 1 · b: two");
    expect(logPreview(event("reasoning_delta", { turn: 1, step: 1, chunk: "abc" }))).toBe("abc");
  });

  it("writes times in UTC, and nothing for old logs", () => {
    expect(logTime(Date.UTC(2026, 0, 1, 3, 45, 6, 312))).toBe("03:45:06.312");
    expect(logTime(0)).toBe("");
  });
});

describe("the chat's parts", () => {
  it("lists them in chat order, with a step's tools in a group", () => {
    seq = 0;
    const rows = chatRows([
      event("system_prompt", { text: "rules" }),
      event("user_message", { text: "hi", source: "human" }),
      event("turn_started", { turn: 1 }),
      event("step_started", { turn: 1, step: 1 }),
      event("reasoning_delta", { turn: 1, step: 1, chunk: "think" }),
      event("assistant_message", { turn: 1, step: 1, content: [{ type: "text", text: "ok" }] }),
      event("tool_call", { turn: 1, step: 1, call_id: "c1", name: "bash" }),
      event("tool_call", { turn: 1, step: 1, call_id: "c2", name: "read" }),
      event("tool_result", { call_id: "c1", output: "done" }),
    ]);
    expect(rows.map((r) => [r.type, r.depth, r.location])).toEqual([
      ["system-prompt", 0, ""],
      ["user", 0, "1/1"],
      ["turn-process", 0, "1"],
      ["assistant-step", 0, "1/1"],
      ["assistant-step", 0, "1/1"],
      ["group", 0, ""],
      ["tool-call", 1, "1/1"],
      ["tool-call", 1, "1/1"],
    ]);
    expect(rows[3].index).toBe("assistant-step1:1#reasoning");
    expect(rows[4].index).toBe("assistant-step1:1#response");
    expect((rows[5].value as { members: unknown[] }).members).toHaveLength(2);
    expect(rows[6].value).toMatchObject({ result: { output: "done" } });
    expect(rows[7].value).toMatchObject({ result: null });
  });

  it("finds its rows from a chat element", () => {
    seq = 0;
    const rows = chatRows([
      event("user_message", { text: "hi", source: "human" }),
      event("turn_started", { turn: 1 }),
      event("tool_call", { turn: 1, step: 1, call_id: "c1", name: "bash" }),
    ]);
    expect(rowForChat(rows, { callId: "c1", turn: 1 })?.type).toBe("tool-call");
    expect(rowForChat(rows, { callId: null, turn: 1 })?.type).toBe("turn-process");
  });
});

describe("the table's rows", () => {
  it("keeps a match's ancestors as context", () => {
    const rows = rawRows(turn());
    const { rows: kept, matches } = filterRows(rows, "TOOL_R");
    expect(kept.map((r) => r.type)).toEqual(["turn_started", "step_started", "tool_result"]);
    expect(matches.size).toBe(1);
  });

  it("hides what is under a folded row", () => {
    const rows = rawRows(turn());
    const stepKey = rows[2].key;
    expect(visibleRows(rows, new Set([stepKey])).map((r) => r.type)).toEqual([
      "user_message",
      "turn_started",
      "step_started",
      "turn_ended",
    ]);
    expect(branches(rows).has(stepKey)).toBe(true);
    expect(ancestorsOf(rows, rows[5]).map((r) => r.type)).toEqual(["turn_started", "step_started"]);
  });

  it("finds the row for a chat element", () => {
    const rows = rawRows(turn());
    expect(rowForChat(rows, { callId: "c1", turn: 1 })?.type).toBe("tool_call");
    expect(rowForChat(rows, { callId: null, turn: 1 })?.type).toBe("turn_started");
    expect(rowForChat(rows, { callId: null, turn: 9 })).toBeUndefined();
  });
});
