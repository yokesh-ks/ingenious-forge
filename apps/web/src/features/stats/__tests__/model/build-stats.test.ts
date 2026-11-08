import { describe, expect, it } from "vitest";
import type { SessionEnvelope, SessionEvent } from "@/api/types";
import {
  answerPreview,
  buildStats,
  cacheHit,
  callGroups,
  contextTokens,
  countLines,
  diffLines,
  formatClock,
  formatClockMs,
  formatKTokens,
  formatMs,
  stepTiming,
  toolHint,
  turnTotals,
} from "../../model/build-stats";

const S = "s1";
let seq = 0;
const at = (ts: number, event: SessionEvent): SessionEnvelope =>
  ({ ...event, seq: ++seq, ts }) as SessionEnvelope;

const usage = (input: number, output: number, cache_read = 0, cache_write = 0) => ({
  input,
  output,
  cache_read,
  cache_write,
});

/** One turn: a step that runs two tools, then a step that answers. */
function session(): SessionEnvelope[] {
  return [
    at(1_000, { type: "user_message", session_id: S, text: "List the files", source: "human" }),
    at(1_010, { type: "turn_started", session_id: S, turn: 1 }),
    at(1_020, { type: "step_started", session_id: S, turn: 1, step: 1 }),
    at(1_030, { type: "system_prompt", session_id: S, text: "x".repeat(6_100) }),
    at(1_040, {
      type: "request_header",
      session_id: S,
      provider: "nvidia",
      model: "nemotron",
      max_tokens: null,
      tools: [],
      reason: "first",
    }),
    at(2_000, {
      type: "assistant_message",
      session_id: S,
      turn: 1,
      step: 1,
      content: [
        { type: "text", text: "I'll start by listing." },
        { type: "tool_use", id: "t1", name: "bash", input: {} },
      ],
      provider: "nvidia",
      model: "nemotron",
      usage: usage(1_000, 290, 20_000),
    }),
    at(2_010, {
      type: "tool_call",
      session_id: S,
      call_id: "t1",
      name: "bash",
      args: { command: "ls", description: "List top-level project files" },
      turn: 1,
      step: 1,
    }),
    at(2_100, {
      type: "tool_result",
      session_id: S,
      call_id: "t1",
      output: "a\nb\nc",
      is_error: false,
      exit_code: 0,
      meta: null,
      started_at: 2_010,
      ended_at: 2_090,
    }),
    at(2_110, {
      type: "tool_call",
      session_id: S,
      call_id: "t2",
      name: "read",
      args: { file_path: "/p/README.md" },
      turn: 1,
      step: 1,
    }),
    at(2_200, {
      type: "tool_result",
      session_id: S,
      call_id: "t2",
      output: "readme",
      is_error: false,
      exit_code: null,
      meta: null,
      started_at: 2_110,
      ended_at: 2_140,
    }),
    at(2_210, {
      type: "step_ended",
      session_id: S,
      turn: 1,
      step: 1,
      usage: usage(1_000, 290, 20_000),
      first_token_ms: 600,
      generation_ms: 300,
    }),
    at(2_250, { type: "step_started", session_id: S, turn: 1, step: 2 }),
    at(4_000, {
      type: "assistant_message",
      session_id: S,
      turn: 1,
      step: 2,
      content: [{ type: "text", text: "Here is the summary." }],
      provider: "nvidia",
      model: "nemotron",
      usage: usage(3_000, 950, 21_000),
    }),
    at(4_010, {
      type: "step_ended",
      session_id: S,
      turn: 1,
      step: 2,
      usage: usage(3_000, 950, 21_000),
      first_token_ms: 1_000,
      generation_ms: 700,
    }),
    at(4_020, {
      type: "turn_ended",
      session_id: S,
      turn: 1,
      reason: { kind: "completed" },
    }),
  ];
}

describe("buildStats", () => {
  it("groups steps under the turn the user's message started", () => {
    const [turn] = buildStats(session());
    expect(turn.turn).toBe(1);
    expect(turn.trigger).toBe("List the files");
    expect(turn.startedAt).toBe(1_010);
    expect(turn.endedAt).toBe(4_020);
    expect(turn.steps.map((s) => s.step)).toEqual([1, 2]);
  });

  it("records each step's tools with their output size and time", () => {
    const [turn] = buildStats(session());
    const [first, second] = turn.steps;
    expect(first.tools).toEqual([
      expect.objectContaining({
        name: "bash",
        hint: "List top-level project files",
        chars: 5,
        lines: 3,
        ms: 80,
      }),
      expect.objectContaining({ name: "read", hint: "/p/README.md", chars: 6, ms: 30 }),
    ]);
    expect(first.answer).toBe("I'll start by listing.");
    expect(second.tools).toEqual([]);
    expect(second.answer).toBe("Here is the summary.");
  });

  it("keeps request and prompt changes as event rows before their step's work", () => {
    const [turn] = buildStats(session());
    expect(
      turn.rows.map((r) => (r.kind === "step" ? `step ${r.step.step}` : r.event.label)),
    ).toEqual(["step 1", "System prompt", "Request header", "step 2"]);
    const prompt = turn.rows.find((r) => r.kind === "event");
    expect(prompt?.kind === "event" && prompt.event.detail).toBe("set · 6.1K chars");
    const header = turn.rows.filter((r) => r.kind === "event")[1];
    expect(header.kind === "event" && header.event.detail).toBe("initial · 0 tools");
  });

  it("marks how each turn ended", () => {
    const events = session();
    const running = buildStats(events.slice(0, -1))[0];
    expect(running.state).toBe("running");
    expect(buildStats(events)[0].state).toBe("completed");
    const failed = [
      ...events.slice(0, -1),
      at(4_020, {
        type: "turn_ended",
        session_id: S,
        turn: 1,
        reason: { kind: "error", code: "model", message: "boom" },
      }),
    ];
    expect(buildStats(failed)[0].state).toBe("failed");
    const stopped = [
      ...events.slice(0, -1),
      at(4_020, { type: "turn_ended", session_id: S, turn: 1, reason: { kind: "interrupted" } }),
    ];
    expect(buildStats(stopped)[0].state).toBe("interrupted");
  });

  it("adds approval and failed-attempt rows, naming the tool asked about", () => {
    const events = session();
    const [turn] = buildStats([
      ...events.slice(0, 5),
      at(1_050, {
        type: "approval_requested",
        session_id: S,
        call_id: "t1",
        kind: "command",
        command: "ls",
        path: null,
        diff: null,
      }),
      at(1_060, { type: "approval_resolved", session_id: S, call_id: "t1", decision: "approve" }),
      at(1_070, { type: "assistant_attempt", session_id: S, turn: 1, step: 1, error: "reset" }),
      ...events.slice(5),
    ]);
    const rows = turn.rows.flatMap((r) =>
      r.kind === "event" ? [`${r.event.label} | ${r.event.subject} | ${r.event.detail}`] : [],
    );
    expect(rows).toEqual([
      "System prompt | set | set · 6.1K chars",
      "Request header | nvidia / nemotron | initial · 0 tools",
      "Approval | command | ls · waiting",
      "Approval | command | ls · allowed once",
      "Model attempt | reset | Model attempt without a committed message",
    ]);
  });

  it("records failures, edit line counts and read files on tool calls", () => {
    const events = session();
    const [turn] = buildStats([
      ...events.slice(0, 7),
      at(2_100, {
        type: "tool_result",
        session_id: S,
        call_id: "t1",
        output: "no such file",
        is_error: true,
        exit_code: 1,
        meta: null,
        started_at: 2_010,
        ended_at: 2_090,
      }),
      at(2_105, {
        type: "tool_call",
        session_id: S,
        call_id: "e1",
        name: "edit",
        args: { file_path: "/p/src/a.ts" },
        turn: 1,
        step: 1,
      }),
      at(2_106, {
        type: "tool_result",
        session_id: S,
        call_id: "e1",
        output: "edited",
        is_error: false,
        exit_code: null,
        meta: { path: "/p/src/a.ts", additions: 3, deletions: 1, diff: "@@ -1 +1 @@\n-a\n+b" },
        started_at: 2_105,
        ended_at: 2_106,
      }),
      ...events.slice(8),
    ]);
    const [bash, edit] = turn.steps[0].tools;
    expect(bash.isError).toBe(true);
    expect(edit).toEqual(
      expect.objectContaining({
        hint: "src/a.ts",
        added: 3,
        removed: 1,
        diff: "@@ -1 +1 @@\n-a\n+b",
      }),
    );
  });

  it("keeps the first 16,000 characters of a long answer or result", () => {
    const events = session();
    const long = "y".repeat(16_500);
    const [turn] = buildStats([
      ...events.slice(0, 7),
      at(2_100, {
        type: "tool_result",
        session_id: S,
        call_id: "t1",
        output: long,
        is_error: false,
        exit_code: 0,
        meta: null,
        started_at: 2_010,
        ended_at: 2_090,
      }),
      ...events.slice(8),
    ]);
    const [bash] = turn.steps[0].tools;
    expect(bash.chars).toBe(16_500);
    expect(bash.output?.length).toBe(16_000);
    expect(bash.truncated).toBe(true);
  });
});

describe("execution cell parts", () => {
  it("cuts each tool's hint to the reference lengths", () => {
    expect(toolHint("bash", { description: "List project files excluding the build" })).toBe(
      "List project files excluding …",
    );
    expect(toolHint("bash", { command: "ls -la\npwd" })).toBe("ls -la");
    expect(toolHint("read", { file_path: "/Users/me/ingenious-forge/README.md" })).toBe(
      "ingenious-forge/README.md",
    );
    expect(toolHint("glob", { pattern: "**/*.md", include: "docs" })).toBe("**/*.md (docs)");
    expect(toolHint("web_fetch", { url: "https://example.com/a" })).toBe("example.com/a");
    expect(toolHint("todo_write", {})).toBeNull();
  });

  it("counts lines without a trailing newline's empty line", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a")).toBe(1);
    expect(countLines("a\nb\n")).toBe(2);
  });

  it("groups calls by tool and target, in first-call order", () => {
    const [turn] = buildStats(session());
    const tools = turn.steps[0].tools;
    const groups = callGroups([tools[0], tools[1], tools[0]]);
    expect(groups.map((g) => `${g.name} ${g.hint} ×${g.calls.length}`)).toEqual([
      "bash List top-level project files ×2",
      "read /p/README.md ×1",
    ]);
  });

  it("previews an answer by its first non-empty line", () => {
    expect(answerPreview("\n\n  First line\nsecond")).toBe("First line");
    expect(answerPreview("  ")).toBeNull();
  });

  it("turns a unified diff into signed lines without its headers", () => {
    expect(diffLines("--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n keep\n-old\n+new")).toEqual([
      { sign: " ", text: "keep" },
      { sign: "−", text: "old" },
      { sign: "+", text: "new" },
    ]);
  });
});

describe("step and turn figures", () => {
  it("splits a step's time into first token, generation, tools and the rest", () => {
    const [turn] = buildStats(session());
    expect(stepTiming(turn.steps[0])).toEqual({
      firstTokenMs: 600,
      generationMs: 300,
      modelMs: 900,
      toolMs: 110,
      totalMs: 1_190,
      otherMs: 180,
      tps: 290 / 0.3,
    });
  });

  it("totals a turn: sums, latest context, overall speed and cache hit", () => {
    const [turn] = buildStats(session());
    const totals = turnTotals(turn, "latest");
    expect(totals.context).toBe(3_000 + 21_000);
    expect(totals.output).toBe(1_240);
    expect(totals.firstTokenMs).toBe(1_600);
    expect(totals.modelMs).toBe(2_600);
    expect(totals.toolMs).toBe(110);
    expect(totals.totalMs).toBe(3_010);
    expect(totals.tps).toBeCloseTo(1_240 / 1.0);
    expect(totals.usage).toEqual(usage(4_000, 1_240, 41_000));
    expect(turnTotals(turn, "cumulative").context).toBe(21_000 + 24_000);
  });

  it("has no time for a step whose start was not recorded", () => {
    const [turn] = buildStats([
      at(0, { type: "turn_started", session_id: S, turn: 1 }),
      at(0, { type: "step_started", session_id: S, turn: 1, step: 1 }),
      at(0, {
        type: "step_ended",
        session_id: S,
        turn: 1,
        step: 1,
        usage: null,
        first_token_ms: null,
        generation_ms: null,
      }),
    ]);
    const timing = stepTiming(turn.steps[0]);
    expect(timing.totalMs).toBeNull();
    expect(timing.tps).toBeNull();
    expect(turn.startedAt).toBeNull();
  });
});

describe("formatting", () => {
  it("formats durations as ms, seconds or minutes", () => {
    expect(formatMs(30)).toBe("30 ms");
    expect(formatMs(864)).toBe("864 ms");
    expect(formatMs(2_270)).toBe("2.27 s");
    expect(formatMs(72_000)).toBe("1.2 min");
    expect(formatMs(null)).toBe("—");
  });

  it("formats tokens in thousands", () => {
    expect(formatKTokens(290)).toBe("0.29K");
    expect(formatKTokens(60)).toBe("0.06K");
    expect(formatKTokens(1_900)).toBe("1.9K");
    expect(formatKTokens(79_900)).toBe("79.9K");
    expect(formatKTokens(12_300_000)).toBe("12.3M");
  });

  it("gives the context and cache hit of a usage", () => {
    expect(contextTokens(usage(69_286, 10, 160_432))).toBe(229_718);
    expect(cacheHit(usage(69_286, 10, 160_432))).toBe("69.84%");
    expect(cacheHit(usage(0, 10))).toBeNull();
  });

  it("formats a logged time as month-day and clock", () => {
    const ts = new Date(2026, 10, 8, 9, 15, 6, 410).getTime();
    expect(formatClockMs(ts, false)).toBe("11-08 09:15");
    expect(formatClockMs(ts, true)).toBe("11-08 09:15:06.410");
    expect(formatClock(ts)).toBe("09:15:06");
  });
});
