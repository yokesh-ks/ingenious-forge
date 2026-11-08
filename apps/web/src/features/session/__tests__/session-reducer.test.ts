import { describe, expect, it } from "vitest";
import type { SessionEvent, TurnEndReason } from "@/api/types";
import {
  initialSessionState,
  MAX_SHELL_LINES,
  type SessionState,
  sessionReducer,
  type ToolItem,
} from "../session-reducer";

const S = "s1";

function apply(state: SessionState, ...events: SessionEvent[]): SessionState {
  return events.reduce((acc, event) => sessionReducer(acc, { kind: "event", event }), state);
}

/** The user sends `text` and the server echoes it back. */
function sent(text: string, state = initialSessionState): SessionState {
  const sending = sessionReducer(state, { kind: "send", text });
  return sessionReducer(sending, {
    kind: "event",
    event: { type: "user_message", session_id: S, text, source: "human" },
  });
}

describe("sessionReducer", () => {
  it("starts empty and idle", () => {
    expect(initialSessionState).toEqual({
      messages: [],
      running: false,
      error: null,
      streamingId: null,
      changedFiles: [],
    });
  });

  it("marks the turn running as soon as a message is sent", () => {
    const state = sessionReducer(initialSessionState, { kind: "send", text: "hello" });
    expect(state.running).toBe(true);
    // The message itself appears when the server echoes it back.
    expect(state.messages).toEqual([]);
  });

  it("adds the user's message when the server echoes it", () => {
    const state = sent("hello");
    expect(state.messages).toEqual([{ id: "m0", role: "user", text: "hello" }]);
    expect(state.running).toBe(true);
  });

  it("shows messages sent from another tab", () => {
    const state = apply(initialSessionState, {
      type: "user_message",
      session_id: S,
      text: "from tab 2",
      source: "human",
    });
    expect(state.messages).toEqual([{ id: "m0", role: "user", text: "from tab 2" }]);
  });

  it("streams output chunks into one assistant message", () => {
    const state = apply(
      sent("hi"),
      { type: "turn_started", session_id: S, turn: 1 },
      { type: "output", session_id: S, chunk: "Hel" },
      { type: "output", session_id: S, chunk: "lo" },
    );
    expect(state.messages).toEqual([
      { id: "m0", role: "user", text: "hi" },
      { id: "m1", role: "assistant", text: "Hello" },
    ]);
    expect(state.running).toBe(true);
  });

  it("ends the turn on done and starts a new reply next turn", () => {
    let state = apply(
      sent("one"),
      { type: "turn_started", session_id: S, turn: 1 },
      { type: "output", session_id: S, chunk: "A" },
      { type: "done", session_id: S },
    );
    expect(state.running).toBe(false);
    state = apply(
      sent("two", state),
      { type: "turn_started", session_id: S, turn: 1 },
      { type: "output", session_id: S, chunk: "B" },
    );
    expect(state.messages.map((m) => [m.role, "text" in m ? m.text : m.name])).toEqual([
      ["user", "one"],
      ["assistant", "A"],
      ["user", "two"],
      ["assistant", "B"],
    ]);
    expect(new Set(state.messages.map((m) => m.id)).size).toBe(4);
  });

  it("records an error, keeps partial output and stops running", () => {
    const state = apply(
      sent("hi"),
      { type: "output", session_id: S, chunk: "par" },
      { type: "error", session_id: S, message: "no key" },
    );
    expect(state.error).toBe("no key");
    expect(state.running).toBe(false);
    expect(state.messages[state.messages.length - 1]).toMatchObject({ text: "par" });
  });

  it("clears a previous error when the next message is sent", () => {
    const failed = apply(sent("hi"), { type: "error", session_id: S, message: "x" });
    expect(sent("again", failed).error).toBeNull();
  });

  it("marks running when another tab starts a turn", () => {
    expect(
      apply(initialSessionState, { type: "turn_started", session_id: S, turn: 1 }).running,
    ).toBe(true);
  });

  it("adds a running tool card on tool_call", () => {
    const state = apply(sent("read it"), {
      type: "tool_call",
      session_id: S,
      call_id: "t1",
      name: "read_file",
      args: { path: "a.txt" },
      turn: 1,
      step: 1,
    });
    expect(state.messages[1]).toEqual({
      id: "m1",
      role: "tool",
      callId: "t1",
      name: "read_file",
      args: { path: "a.txt" },
      status: "running",
      output: null,
      lines: [],
      hiddenLines: 0,
      exitCode: null,
      approval: null,
      question: null,
      todos: null,
      meta: null,
    });
  });

  it("fills in the result of the matching tool call", () => {
    const state = apply(
      sent("go"),
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "read_file",
        args: {},
        turn: 1,
        step: 1,
      },
      {
        type: "tool_call",
        session_id: S,
        call_id: "t2",
        name: "list_directory",
        args: {},
        turn: 1,
        step: 1,
      },
      {
        type: "tool_result",
        session_id: S,
        call_id: "t2",
        output: "a.txt",
        is_error: false,
        exit_code: null,
        meta: null,
        started_at: 0,
        ended_at: 0,
      },
      {
        type: "tool_result",
        session_id: S,
        call_id: "t1",
        output: "nope",
        is_error: true,
        exit_code: null,
        meta: null,
        started_at: 0,
        ended_at: 0,
      },
    );
    expect(state.messages.slice(1)).toMatchObject([
      { callId: "t1", status: "error", output: "nope" },
      { callId: "t2", status: "done", output: "a.txt" },
    ]);
  });

  it("ignores a result for an unknown tool call", () => {
    const state = sent("go");
    expect(
      apply(state, {
        type: "tool_result",
        session_id: S,
        call_id: "zz",
        output: "x",
        is_error: false,
        exit_code: null,
        meta: null,
        started_at: 0,
        ended_at: 0,
      }),
    ).toEqual(state);
  });

  it("starts a new assistant message for text after a tool call", () => {
    const state = apply(
      sent("go"),
      { type: "output", session_id: S, chunk: "Looking. " },
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "read_file",
        args: {},
        turn: 1,
        step: 1,
      },
      {
        type: "tool_result",
        session_id: S,
        call_id: "t1",
        output: "x",
        is_error: false,
        exit_code: null,
        meta: null,
        started_at: 0,
        ended_at: 0,
      },
      { type: "output", session_id: S, chunk: "Found it." },
    );
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(state.messages[3]).toMatchObject({ text: "Found it." });
  });

  it("appends streamed shell lines to their tool call while it runs", () => {
    const state = apply(
      sent("go"),
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "run_shell",
        args: {},
        turn: 1,
        step: 1,
      },
      { type: "tool_output", session_id: S, call_id: "t1", stream: "stdout", text: "hello" },
      { type: "tool_output", session_id: S, call_id: "t1", stream: "stderr", text: "warn" },
    );
    expect(state.messages[1]).toMatchObject({
      status: "running",
      lines: [
        { stream: "stdout", text: "hello" },
        { stream: "stderr", text: "warn" },
      ],
    });
  });

  it("keeps the exit code from the tool result", () => {
    const state = apply(
      sent("go"),
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "run_shell",
        args: {},
        turn: 1,
        step: 1,
      },
      {
        type: "tool_result",
        session_id: S,
        call_id: "t1",
        output: "Exit code: 3",
        is_error: false,
        exit_code: 3,
        meta: null,
        started_at: 0,
        ended_at: 0,
      },
    );
    expect(state.messages[1]).toMatchObject({ status: "done", exitCode: 3 });
  });

  it("treats a result logged without an exit code as having none", () => {
    const old = {
      type: "tool_result",
      session_id: S,
      call_id: "t1",
      output: "x",
      is_error: false,
      meta: null,
      started_at: 0,
      ended_at: 0,
    } as unknown as SessionEvent;
    const state = apply(
      sent("go"),
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "read_file",
        args: {},
        turn: 1,
        step: 1,
      },
      old,
    );
    expect(state.messages[1]).toMatchObject({ status: "done", exitCode: null });
  });

  it("keeps only the newest shell lines and counts the rest", () => {
    const events: SessionEvent[] = [
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "run_shell",
        args: {},
        turn: 1,
        step: 1,
      },
    ];
    for (let i = 1; i <= MAX_SHELL_LINES + 500; i++) {
      events.push({
        type: "tool_output",
        session_id: S,
        call_id: "t1",
        stream: "stdout",
        text: `line ${i}`,
      });
    }
    const state = sessionReducer(sent("go"), { kind: "events", events });
    const item = state.messages[1] as ToolItem;
    expect(item.lines).toHaveLength(MAX_SHELL_LINES);
    expect(item.lines[0].text).toBe("line 501");
    expect(item.lines[item.lines.length - 1].text).toBe(`line ${MAX_SHELL_LINES + 500}`);
    expect(item.hiddenLines).toBe(500);
  });

  it("applies a long stream of shell lines quickly", () => {
    let state = apply(sent("go"), {
      type: "tool_call",
      session_id: S,
      call_id: "t1",
      name: "run_shell",
      args: {},
      turn: 1,
      step: 1,
    });
    const started = performance.now();
    for (let i = 0; i < 20_000; i++) {
      state = sessionReducer(state, {
        kind: "event",
        event: { type: "tool_output", session_id: S, call_id: "t1", stream: "stdout", text: "x" },
      });
    }
    expect(performance.now() - started).toBeLessThan(2_000);
    expect((state.messages[1] as ToolItem).hiddenLines).toBe(20_000 - MAX_SHELL_LINES);
  });

  it("notes an approval mode change in the timeline", () => {
    const state = apply(sent("go"), {
      type: "approval_mode_changed",
      session_id: S,
      mode: "full_auto",
    });
    expect(state.messages[1]).toMatchObject({ role: "notice", text: "Approval mode: Full-auto" });
  });

  it("puts a pending approval on the tool call, then its answer", () => {
    const asked = apply(
      sent("go"),
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "run_shell",
        args: {},
        turn: 1,
        step: 1,
      },
      {
        type: "approval_requested",
        session_id: S,
        call_id: "t1",
        kind: "command",
        command: "rm -rf build",
        path: null,
        diff: null,
      },
    );
    expect(asked.messages[1]).toMatchObject({
      approval: { kind: "command", command: "rm -rf build", status: "pending" },
    });
    const answered = apply(asked, {
      type: "approval_resolved",
      session_id: S,
      call_id: "t1",
      decision: "deny",
    });
    expect(answered.messages[1]).toMatchObject({ approval: { status: "deny" } });
  });

  describe("questions and plans", () => {
    const question = {
      id: "color",
      question: "Which color do you prefer?",
      header: "Pick one",
      options: [{ label: "Blue", description: null }],
      multi_select: false,
    };
    const asking = (tool: string): SessionState =>
      apply(
        sent("go"),
        { type: "turn_started", session_id: S, turn: 1 },
        {
          type: "tool_call",
          session_id: S,
          call_id: "q1",
          name: tool,
          args: {},
          turn: 1,
          step: 1,
        },
      );

    it("puts a pending question card on the call, then its answers", () => {
      const asked = apply(asking("ask_user_question"), {
        type: "question_asked",
        session_id: S,
        call_id: "q1",
        questions: [question],
      });
      expect(asked.messages[1]).toMatchObject({
        question: { questions: [question], answers: null, status: "pending" },
      });
      const answers = [{ id: "color", selected: ["Blue"] }];
      const answered = apply(asked, {
        type: "question_answered",
        session_id: S,
        call_id: "q1",
        answers,
      });
      expect(answered.messages[1]).toMatchObject({ question: { answers, status: "answered" } });
    });

    it("marks a question cancelled when the turn stops it", () => {
      const asked = apply(asking("ask_user_question"), {
        type: "question_asked",
        session_id: S,
        call_id: "q1",
        questions: [question],
      });
      const stopped = apply(asked, {
        type: "question_answered",
        session_id: S,
        call_id: "q1",
        answers: null,
      });
      expect(stopped.messages[1]).toMatchObject({ question: { status: "cancelled" } });
    });

    it("cancels a question left waiting when the turn ends without an answer", () => {
      const ended = apply(
        asking("ask_user_question"),
        { type: "question_asked", session_id: S, call_id: "q1", questions: [question] },
        {
          type: "turn_ended",
          session_id: S,
          turn: 1,
          reason: { kind: "error", code: "SERVER_RESTARTED", message: "restarted" },
        },
      );
      expect(ended.messages[1]).toMatchObject({ question: { status: "cancelled" } });
    });

    it("keeps the plan a todo_write call wrote", () => {
      const todos = [
        { content: "Read", status: "completed" as const },
        { content: "Fix", status: "in_progress" as const },
      ];
      const state = apply(asking("todo_write"), {
        type: "todos_updated",
        session_id: S,
        call_id: "q1",
        todos,
      });
      expect(state.messages[1]).toMatchObject({ todos });
    });
  });

  it("ignores an approval for an unknown tool call", () => {
    const state = sent("go");
    expect(
      apply(state, {
        type: "approval_resolved",
        session_id: S,
        call_id: "zz",
        decision: "approve",
      }),
    ).toEqual(state);
  });

  it("ignores output for an unknown tool call", () => {
    const state = sent("go");
    expect(
      apply(state, {
        type: "tool_output",
        session_id: S,
        call_id: "zz",
        stream: "stdout",
        text: "x",
      }),
    ).toEqual(state);
  });

  it("ignores event types it does not know", () => {
    const state = sent("hi");
    const unknown = { type: "future_event", session_id: S } as unknown as SessionEvent;
    expect(apply(state, unknown)).toEqual(state);
  });

  it("keeps the turn running when a steering message is sent mid-turn", () => {
    const state = sent(
      "use tests",
      apply(sent("build"), { type: "output", session_id: S, chunk: "Building" }),
    );
    expect(state.running).toBe(true);
    const next = apply(state, { type: "output", session_id: S, chunk: "Testing" });
    expect(next.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("ends the turn and adds a notice when interrupted", () => {
    const state = apply(
      sent("go"),
      { type: "output", session_id: S, chunk: "par" },
      { type: "interrupted", session_id: S },
    );
    expect(state.running).toBe(false);
    expect(state.messages[state.messages.length - 1]).toEqual({
      id: "m2",
      role: "notice",
      text: "Turn interrupted",
    });
    const next = apply(state, { type: "output", session_id: S, chunk: "new" });
    expect(next.messages[next.messages.length - 1]).toMatchObject({
      role: "assistant",
      text: "new",
    });
  });

  it("marks tool calls still running as interrupted", () => {
    const state = apply(
      sent("go"),
      {
        type: "tool_call",
        session_id: S,
        call_id: "t1",
        name: "read_file",
        args: {},
        turn: 1,
        step: 1,
      },
      { type: "interrupted", session_id: S },
    );
    expect(state.messages[1]).toMatchObject({ status: "error", output: "Interrupted" });
  });

  describe("turn_ended", () => {
    const ended = (reason: TurnEndReason): SessionEvent => ({
      type: "turn_ended",
      session_id: S,
      turn: 1,
      reason,
    });

    it("ends a completed turn like done", () => {
      const state = apply(
        sent("hi"),
        { type: "output", session_id: S, chunk: "a" },
        ended({ kind: "completed" }),
      );
      expect(state.running).toBe(false);
      expect(state.error).toBeNull();
      const next = apply(state, { type: "output", session_id: S, chunk: "b" });
      expect(next.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    });

    it("ends an interrupted turn like interrupted", () => {
      const state = apply(
        sent("go"),
        {
          type: "tool_call",
          session_id: S,
          call_id: "t1",
          name: "read_file",
          args: {},
          turn: 1,
          step: 1,
        },
        ended({ kind: "interrupted" }),
      );
      expect(state.running).toBe(false);
      expect(state.messages[1]).toMatchObject({ status: "error", output: "Interrupted" });
      expect(state.messages[2]).toMatchObject({ role: "notice", text: "Turn interrupted" });
    });

    it("shows a failed turn's message as the error", () => {
      const state = apply(
        sent("hi"),
        ended({ kind: "error", code: "PROVIDER_ERROR", message: "no key" }),
      );
      expect(state.running).toBe(false);
      expect(state.error).toBe("no key");
    });

    it("leaves the timeline unchanged on step boundaries", () => {
      const state = sent("hi");
      const next = apply(
        state,
        { type: "step_started", session_id: S, turn: 1, step: 1 },
        {
          type: "step_ended",
          session_id: S,
          turn: 1,
          step: 1,
          usage: null,
          first_token_ms: null,
          generation_ms: null,
        },
      );
      expect(next).toBe(state);
    });
  });

  it("lists changed files in first-edit order and keeps the latest diff", () => {
    const change = (path: string, diff: string, additions: number) =>
      ({ type: "file_changed", session_id: S, path, diff, additions, deletions: 0 }) as const;
    const state = apply(
      sent("edit"),
      change("b.txt", "d1", 1),
      change("a.txt", "d2", 1),
      change("b.txt", "d3", 4),
    );
    expect(state.changedFiles).toEqual([
      { path: "b.txt", diff: "d3", additions: 4, deletions: 0 },
      { path: "a.txt", diff: "d2", additions: 1, deletions: 0 },
    ]);
  });

  it("drops a file whose changes were undone", () => {
    const state = apply(
      sent("edit"),
      { type: "file_changed", session_id: S, path: "a", diff: "d", additions: 1, deletions: 0 },
      { type: "file_changed", session_id: S, path: "a", diff: "", additions: 0, deletions: 0 },
    );
    expect(state.changedFiles).toEqual([]);
  });

  it("empties the changed files and confirms in the session after a revert", () => {
    const state = apply(
      sent("edit"),
      { type: "file_changed", session_id: S, path: "a", diff: "d", additions: 1, deletions: 0 },
      { type: "file_changed", session_id: S, path: "b", diff: "d", additions: 1, deletions: 0 },
      { type: "done", session_id: S },
      { type: "changes_reverted", session_id: S, paths: ["a", "b"] },
    );
    expect(state.changedFiles).toEqual([]);
    expect(state.messages[state.messages.length - 1]).toMatchObject({
      role: "notice",
      text: "Reverted 2 files",
    });
  });

  it("uses the singular for one reverted file", () => {
    const state = apply(sent("x"), { type: "changes_reverted", session_id: S, paths: ["a"] });
    expect(state.messages[state.messages.length - 1]).toMatchObject({ text: "Reverted 1 file" });
  });

  it("can record a local error without a server event", () => {
    const state = sessionReducer(sent("hi"), { kind: "local_error", message: "offline" });
    expect(state.error).toBe("offline");
    expect(state.running).toBe(false);
  });
});
