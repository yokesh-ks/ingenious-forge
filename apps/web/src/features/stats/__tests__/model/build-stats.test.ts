import { describe, expect, it } from "vitest";
import type { SessionEnvelope, SessionEvent } from "@/api/types";
import {
  buildStats,
  cacheHit,
  contextTokens,
  formatClockMs,
  formatKTokens,
  formatMs,
  stepTiming,
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
        detail: "List top-level project files",
        chars: 5,
        lines: 3,
        ms: 80,
      }),
      expect.objectContaining({ name: "read", detail: "README.md", chars: 6, ms: 30 }),
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
    expect(prompt?.kind === "event" && prompt.event.detail).toBe("6.1K chars");
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
  });
});
