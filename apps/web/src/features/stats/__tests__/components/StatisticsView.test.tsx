import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionEnvelope, SessionEvent, SessionStats } from "@/api/types";
import { fakeFetch } from "@/test/fake-fetch";
import StatisticsView from "../../components/StatisticsView";

const S = "s1";
let seq = 0;
const at = (ts: number, event: SessionEvent): SessionEnvelope =>
  ({ ...event, seq: ++seq, ts }) as SessionEnvelope;

function events(): SessionEnvelope[] {
  return [
    at(1_000, { type: "user_message", session_id: S, text: "List the files", source: "human" }),
    at(1_010, { type: "turn_started", session_id: S, turn: 1 }),
    at(1_020, { type: "step_started", session_id: S, turn: 1, step: 1 }),
    at(1_030, { type: "system_prompt", session_id: S, text: "x".repeat(943) }),
    at(2_010, {
      type: "tool_call",
      session_id: S,
      call_id: "t1",
      name: "bash",
      args: { command: "ls", description: "List files" },
      turn: 1,
      step: 1,
    }),
    at(2_100, {
      type: "tool_result",
      session_id: S,
      call_id: "t1",
      output: "a\nb",
      is_error: false,
      exit_code: 0,
      meta: null,
      started_at: 2_010,
      ended_at: 2_090,
    }),
    at(2_210, {
      type: "step_ended",
      session_id: S,
      turn: 1,
      step: 1,
      usage: { input: 1_000, output: 290, cache_read: 20_000, cache_write: 0 },
      first_token_ms: 600,
      generation_ms: 300,
    }),
    at(2_250, { type: "step_started", session_id: S, turn: 1, step: 2 }),
    at(4_000, {
      type: "assistant_message",
      session_id: S,
      turn: 1,
      step: 2,
      content: [{ type: "text", text: "Here is the **summary**.\n\nMore." }],
      provider: "p",
      model: "m",
      usage: null,
    }),
    at(4_010, {
      type: "step_ended",
      session_id: S,
      turn: 1,
      step: 2,
      usage: { input: 3_000, output: 950, cache_read: 21_000, cache_write: 0 },
      first_token_ms: 1_000,
      generation_ms: 700,
    }),
    at(4_020, { type: "turn_ended", session_id: S, turn: 1, reason: { kind: "completed" } }),
  ];
}

const stats: SessionStats = {
  turns: 1,
  steps: 2,
  usage: { input: 4_000, output: 1_240, cache_read: 41_000, cache_write: 0 },
  model_ms: 2_600,
  tool_ms: 80,
  ttft_ms: 1_600,
  ttft_steps: 2,
  decode_ms: 1_000,
  decode_tokens: 1_240,
  last_context_tokens: 24_000,
  context_window: null,
};

function view(props: Partial<Parameters<typeof StatisticsView>[0]> = {}) {
  fakeFetch({ "GET /api/sessions/s1/stats": stats });
  return render(
    <StatisticsView
      sessionId="s1"
      refreshKey="a"
      events={events()}
      hasOlder={false}
      loadingOlder={false}
      onLoadOlder={() => {}}
      {...props}
    />,
  );
}

const row = (name: RegExp) => screen.getByRole("row", { name });

describe("StatisticsView", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a turn row with its totals and its steps under it", () => {
    view();
    const turn = row(/^Turn 1/);
    expect(turn).toHaveTextContent("List the files");
    expect(turn).toHaveTextContent("bash ×1");
    expect(turn).toHaveTextContent("24.0K"); // the latest step's context
    expect(turn).toHaveTextContent("1.2K");
    expect(turn).toHaveTextContent("1.60 s");
    expect(turn).toHaveTextContent("1240.0 tok/s");
    expect(turn).toHaveTextContent("3.01 s");
    const step1 = row(/^Step 1/);
    expect(step1).toHaveTextContent("bash List files 3 chars");
    expect(
      within(step1).getByTitle(/^started \d\d:\d\d:\d\d · first token 600 ms/),
    ).toBeInTheDocument();
    expect(step1).toHaveTextContent("95.24%");
    expect(step1).toHaveTextContent("80 ms");
    const step2 = row(/^Step 2/);
    expect(step2).toHaveTextContent("answer · Here is the **summary**.");
    expect(step2).not.toHaveTextContent("More.");
    // A step that called no tool has no tool time, and says why.
    expect(within(step2).getByTitle("not recorded")).toHaveTextContent("—");
  });

  it("folds a turn's steps away and back", async () => {
    view();
    await userEvent.click(row(/^Turn 1/));
    expect(screen.queryByRole("row", { name: /^Step 1/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(row(/^Step 1/)).toBeInTheDocument();
  });

  it("opens a step to its answer and each tool call's output", async () => {
    view();
    await userEvent.click(row(/^Step 1/));
    const details = screen.getByRole("region", { name: "Step 1 details" });
    expect(details).toHaveTextContent("1 tool calls");
    expect(details).toHaveTextContent("bash");
    expect(details).toHaveTextContent("3 chars · 2 lines · 80 ms");
    expect(within(details).getByText("a")).toBeInTheDocument();
    expect(within(details).getByText("b")).toBeInTheDocument();
    await userEvent.click(within(details).getByRole("button", { name: "{}" }));
    expect(details).toHaveTextContent("raw arguments");
    expect(details).toHaveTextContent('"description": "List files"');
  });

  it("renders a step's answer as Markdown", async () => {
    view();
    await userEvent.click(row(/^Step 2/));
    const details = screen.getByRole("region", { name: "Step 2 details" });
    expect(within(details).getByText("summary").tagName).toBe("STRONG");
  });

  it("adds event rows, context deltas and the session total on request", async () => {
    view();
    expect(screen.queryByRole("row", { name: /^System prompt/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Show event rows" }));
    expect(row(/^System prompt/)).toHaveTextContent("set · 943 chars");
    expect(row(/^System prompt/)).toHaveTextContent(/^System prompt\s*\d\d:\d\d:\d\d\s*set/);
    await userEvent.click(screen.getByRole("switch", { name: "Show context delta" }));
    expect(row(/^Step 2/)).toHaveTextContent("24.0K+3.0K");
    await userEvent.click(screen.getByRole("switch", { name: "Show total row" }));
    const total = await screen.findByRole("row", { name: /^Whole-session total/ });
    expect(total).toHaveTextContent("Whole-session total · 1 turns · 2 steps");
    expect(total).toHaveTextContent("45.0K");
    // No whole-session wall time exists, so the total is model plus tool time.
    expect(total).toHaveTextContent("2.68 s");
  });

  it("sums the turn's context when the basis is cumulative", async () => {
    view();
    await userEvent.click(screen.getByRole("radio", { name: "Cumulative" }));
    expect(row(/^Turn 1/)).toHaveTextContent("45.0K");
  });

  it("loads earlier turns, or says the beginning is reached", async () => {
    const onLoadOlder = vi.fn();
    const { unmount } = view({ hasOlder: true, onLoadOlder });
    await userEvent.click(screen.getByRole("button", { name: "Load earlier turns" }));
    expect(onLoadOlder).toHaveBeenCalled();
    unmount();
    view();
    expect(screen.getByText("Beginning of history reached")).toBeInTheDocument();
  });

  it("marks cache misses and failures and summarises each tool's output", () => {
    const call = (id: string, name: string, args: object, output: string, is_error = false) => [
      at(2_000, {
        type: "tool_call",
        session_id: S,
        call_id: id,
        name,
        args: args as Record<string, string>,
        turn: 1,
        step: 1,
      }),
      at(2_001, {
        type: "tool_result",
        session_id: S,
        call_id: id,
        output,
        is_error,
        exit_code: null,
        meta: name === "edit" ? { additions: 4, deletions: 2, diff: "-a\n+b" } : null,
        started_at: 2_000,
        ended_at: 2_001,
      }),
    ];
    view({
      events: [
        at(1_000, { type: "user_message", session_id: S, text: "Go", source: "human" }),
        at(1_010, { type: "turn_started", session_id: S, turn: 1 }),
        at(1_020, { type: "step_started", session_id: S, turn: 1, step: 1 }),
        ...call("e", "edit", { file_path: "a.ts" }, "edited"),
        ...call("r", "read", { file_path: "a.md" }, "1: x\n2: y\n"),
        ...call("b1", "bash", { command: "ls" }, "boom", true),
        ...call("b2", "bash", { command: "pwd" }, "/p"),
        ...call("g", "glob", { pattern: "*.md" }, "a.md"),
        at(2_210, {
          type: "step_ended",
          session_id: S,
          turn: 1,
          step: 1,
          usage: { input: 9_000, output: 10, cache_read: 1_000, cache_write: 0 },
          first_token_ms: 100,
          generation_ms: 100,
        }),
      ],
    });
    const turn = row(/^Turn 1/);
    expect(turn).toHaveTextContent("running");
    expect(turn).toHaveTextContent("cache miss");
    expect(turn).toHaveTextContent("1 failed");
    // Pills are ordered by count, three at most.
    expect(turn).toHaveTextContent(/bash ×2\s*edit ×1\s*read ×1\s*1 more\s*→ 26 chars/);
    const step = row(/^Step 1/);
    expect(step).toHaveTextContent("read a.md 2 lines");
    expect(step).toHaveTextContent("bash ls 4 chars");
    expect(step).toHaveTextContent("edit a.ts +4 −2");
    expect(step).toHaveTextContent("2 more calls");
  });

  it("says when there is nothing to show yet", () => {
    view({ events: [] });
    expect(screen.getByText(/No turns yet/)).toBeInTheDocument();
  });
});
