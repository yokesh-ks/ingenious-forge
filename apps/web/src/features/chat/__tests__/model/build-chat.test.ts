import { describe, expect, it } from "vitest";
import type { SessionEnvelope, SessionEvent } from "@/api/types";
import {
  initialSessionState,
  type SessionState,
  sessionReducer,
} from "@/features/session/session-reducer";
import {
  buildChat,
  type ChatGroup,
  type ChatTurn,
  formatDuration,
  groupTitle,
  rowDetail,
} from "../../model/build-chat";

const S = "s1";
let seq = 0;

/** Folds events, each logged `ts` ms after the epoch, into a state. */
function fold(events: (SessionEvent & { ts?: number })[]): SessionState {
  const envelopes = events.map((e) => ({ seq: ++seq, ts: 0, ...e }) as SessionEnvelope);
  return sessionReducer(initialSessionState, { kind: "events", events: envelopes });
}

const user = (text: string, source: "human" | "steering" = "human"): SessionEvent => ({
  type: "user_message",
  session_id: S,
  text,
  source,
});
const started = (turn: number, ts = 1_000) => ({
  type: "turn_started" as const,
  session_id: S,
  turn,
  ts,
});
const ended = (
  turn: number,
  kind: "completed" | "interrupted" | "error" = "completed",
  ts = 18_000,
) => ({
  type: "turn_ended" as const,
  session_id: S,
  turn,
  reason:
    kind === "error"
      ? { kind, code: "PROVIDER_ERROR", message: "boom" }
      : ({ kind } as { kind: "completed" | "interrupted" }),
  ts,
});
const say = (chunk: string): SessionEvent => ({ type: "output", session_id: S, chunk });
const think = (chunk: string, step = 1): SessionEvent => ({
  type: "reasoning_delta",
  session_id: S,
  turn: 1,
  step,
  chunk,
});
const call = (id: string, name: string, args: object = {}, step = 1): SessionEvent => ({
  type: "tool_call",
  session_id: S,
  call_id: id,
  name,
  args: args as never,
  turn: 1,
  step,
});
const result = (id: string, is_error = false): SessionEvent => ({
  type: "tool_result",
  session_id: S,
  call_id: id,
  output: "ok",
  is_error,
  exit_code: null,
  meta: null,
  started_at: 0,
  ended_at: 0,
});

function turnOf(state: SessionState): ChatTurn {
  const node = buildChat(state).find((n) => n.kind === "turn");
  if (node?.kind !== "turn") throw new Error("no turn");
  return node;
}
const groups = (turn: ChatTurn) => turn.nodes.filter((n): n is ChatGroup => n.kind === "group");

describe("buildChat", () => {
  it("puts the user's message before its turn and splits groups at replies", () => {
    const state = fold([
      user("List the files"),
      started(1),
      think("The user wants me to:\nlist files"),
      say("I'll list the files."),
      call("t1", "bash", { command: "ls", description: "List top-level project files" }),
      result("t1"),
      call("t2", "read", { file_path: "/p/README.md" }, 2),
      result("t2"),
      say("Here is the summary."),
      ended(1),
    ]);
    const chat = buildChat(state);
    expect(chat.map((n) => n.kind)).toEqual(["message", "turn"]);
    const turn = turnOf(state);
    expect(turn.nodes.map((n) => n.kind)).toEqual(["group", "reply", "group", "reply"]);
    const [first, second] = groups(turn);
    expect(first.title).toBe("Analysis completed");
    // A step change does not split a group.
    expect(second.items.map((i) => i.id)).toHaveLength(2);
    expect(second.title).toBe("Ran commands and read files");
    expect(second.activity).toBe("commands");
    expect(turn.status).toBe("completed");
    expect(turn.durationMs).toBe(17_000);
    expect(turn.collapsible).toBe(true);
  });

  it("puts injected context in the turn's groups and titles a context-only group", () => {
    const prompt: SessionEvent = {
      type: "system_prompt",
      session_id: S,
      text: '<project_instructions path="AGENTS.md">\nx\n</project_instructions>',
    };
    const alone = turnOf(fold([user("hi"), started(1), prompt, say("Hello"), ended(1)]));
    expect(groups(alone)[0].title).toBe("Injected context");
    const mixed = turnOf(
      fold([user("go"), started(1), prompt, call("t1", "read"), result("t1"), ended(1)]),
    );
    expect(groups(mixed)[0].title).toBe("Read files");
    expect(groups(mixed)[0].items.map((i) => i.role)).toEqual(["context", "tool"]);
  });

  it("carries a failed turn's reason", () => {
    const turn = turnOf(
      fold([user("go"), started(1), call("t1", "read"), result("t1"), ended(1, "error")]),
    );
    expect(turn.failure).toEqual({ code: "PROVIDER_ERROR", message: "boom" });
  });

  it("ignores whitespace-only text between tool calls", () => {
    const turn = turnOf(
      fold([
        user("go"),
        started(1),
        call("t1", "read"),
        result("t1"),
        say("  \n"),
        call("t2", "read"),
        result("t2"),
        ended(1),
      ]),
    );
    expect(turn.nodes.map((n) => n.kind)).toEqual(["group"]);
  });

  it("titles a running group by its newest running call", () => {
    const turn = turnOf(
      fold([user("go"), started(1), call("t1", "read"), result("t1"), call("t2", "grep")]),
    );
    const [group] = groups(turn);
    expect(group.running).toBe(true);
    expect(group.title).toBe("Searching code");
    expect(turn.status).toBe("running");
    expect(turn.collapsible).toBe(false);
  });

  it("titles a running group with no running call as analyzing", () => {
    const turn = turnOf(fold([user("go"), started(1), think("hmm")]));
    expect(groups(turn)[0].title).toBe("Analyzing the request");
  });

  it("keeps failed and stopped turns open", () => {
    const failed = turnOf(
      fold([user("go"), started(1), call("t1", "read"), result("t1"), ended(1, "error")]),
    );
    expect(failed.status).toBe("failed");
    expect(failed.collapsible).toBe(false);
    const stopped = turnOf(
      fold([user("go"), started(1), call("t1", "bash"), ended(1, "interrupted")]),
    );
    expect(stopped.status).toBe("stopped");
    expect(stopped.collapsible).toBe(false);
  });

  it("does not fold a turn the user steered after its first process item", () => {
    const turn = turnOf(
      fold([
        user("go"),
        started(1),
        call("t1", "read"),
        result("t1"),
        user("also check tests", "steering"),
        call("t2", "read"),
        result("t2"),
        ended(1),
      ]),
    );
    expect(turn.nodes.map((n) => n.kind)).toEqual(["group", "steer", "group"]);
    expect(turn.collapsible).toBe(false);
  });

  it("does not fold a completed turn without process content", () => {
    const turn = turnOf(fold([user("hi"), started(1), say("Hello"), ended(1)]));
    expect(turn.collapsible).toBe(false);
  });

  it("has no duration when the turn's start time is unknown", () => {
    const turn = turnOf(
      fold([user("go"), started(1, 0), call("t1", "read"), result("t1"), ended(1)]),
    );
    expect(turn.durationMs).toBeNull();
  });

  it("maps the old tool names to the same categories", () => {
    const turn = turnOf(
      fold([
        user("go"),
        started(1),
        call("t1", "read_file"),
        result("t1"),
        call("t2", "run_shell"),
        result("t2"),
        call("t3", "run_shell"),
        result("t3"),
        ended(1),
      ]),
    );
    expect(groups(turn)[0].title).toBe("Ran commands and read files");
  });
});

describe("groupTitle", () => {
  it("joins one to three categories and says etc. for four or more", () => {
    expect(groupTitle(["read"])).toBe("Read files");
    expect(groupTitle(["read", "edit"])).toBe("Read files and edited files");
    expect(groupTitle(["read", "edit", "commands"])).toBe("Read files, edited files, ran commands");
    expect(groupTitle(["read", "edit", "commands", "search", "tools"])).toBe(
      "Read files, edited files, ran commands etc.",
    );
  });

  it("ranks by count, ties by first occurrence", () => {
    expect(groupTitle(["read", "commands", "commands", "edit", "read"])).toBe(
      "Read files, ran commands, edited files",
    );
    expect(groupTitle(["edit", "read", "read"])).toBe("Read files and edited files");
  });

  it("names unknown tools as called tools", () => {
    expect(groupTitle(["tools"])).toBe("Called tools");
    expect(groupTitle([])).toBe("Analysis completed");
  });
});

describe("rowDetail", () => {
  it("picks the first non-empty argument in priority order", () => {
    expect(rowDetail({ command: "ls", description: "List files" })).toEqual({
      text: "List files",
      path: null,
    });
    expect(rowDetail({ description: "", command: "ls" })).toEqual({ text: "ls", path: null });
    expect(rowDetail({ pattern: "TODO", path: "src" })).toEqual({ text: "TODO", path: null });
    expect(rowDetail({ questions: [] })).toEqual({ text: "", path: null });
  });

  it("shows a file path by its base name, keeping the path to open", () => {
    expect(rowDetail({ file_path: "/p/docs/README.md" })).toEqual({
      text: "README.md",
      path: "/p/docs/README.md",
    });
    expect(rowDetail({ path: "src/" })).toEqual({ text: "src", path: "src/" });
  });
});

describe("durations", () => {
  it("formats a finished turn without a leading zero, minutes from 60 s", () => {
    expect(formatDuration(400)).toBe("0s");
    expect(formatDuration(17_200)).toBe("17s");
    expect(formatDuration(59_600)).toBe("1m 0s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });
});
