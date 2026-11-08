import type { SessionEnvelope, SessionEvent } from "@/api/types";

export const S = "s1";
let seq = 0;
export const at = (ts: number, event: SessionEvent): SessionEnvelope =>
  ({ ...event, seq: ++seq, ts }) as SessionEnvelope;

const usage = (input: number, output: number, cache_read = 0) => ({
  input,
  output,
  cache_read,
  cache_write: 0,
});

export const READ_SCHEMA = {
  name: "read",
  description: "Read a UTF-8 text file and return line-numbered content.",
  parameters: {
    type: "object",
    properties: { file_path: { type: "string", description: "Path to read." } },
    required: ["file_path"],
  },
};

/** One turn: a step that thinks, writes and calls two tools, then a step
 * that answers; then a second turn that answers at once. */
export function session(): SessionEnvelope[] {
  return [
    at(1_000, { type: "user_message", session_id: S, text: "List the files", source: "human" }),
    at(1_010, { type: "turn_started", session_id: S, turn: 1 }),
    at(1_020, { type: "step_started", session_id: S, turn: 1, step: 1 }),
    at(1_030, {
      type: "system_prompt",
      session_id: S,
      text: 'You are Forge.\n<project_instructions path="AGENTS.md">\nBe brief.\n</project_instructions>',
    }),
    at(1_040, {
      type: "request_header",
      session_id: S,
      provider: "google",
      model: "gemini",
      max_tokens: 8192,
      tools: [READ_SCHEMA, { name: "bash", description: "Run a command.", parameters: {} }],
      reason: "first",
    }),
    at(2_000, {
      type: "assistant_message",
      session_id: S,
      turn: 1,
      step: 1,
      content: [
        { type: "thinking", thinking: "Look first." },
        { type: "text", text: "I'll list the files." },
        { type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } },
        { type: "tool_use", id: "t2", name: "read", input: { file_path: "/p/README.md" } },
      ],
      provider: "google",
      model: "gemini",
      usage: usage(1_000, 40, 3_000),
    }),
    at(2_010, {
      type: "tool_call",
      session_id: S,
      call_id: "t1",
      name: "bash",
      args: { command: "ls" },
      turn: 1,
      step: 1,
    }),
    at(2_100, {
      type: "tool_result",
      session_id: S,
      call_id: "t1",
      output: "a.md\nb.md",
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
      output: "no such file",
      is_error: true,
      exit_code: null,
      meta: { path: "/p/README.md", total_lines: 0 },
      started_at: 2_110,
      ended_at: 2_140,
    }),
    at(2_210, {
      type: "step_ended",
      session_id: S,
      turn: 1,
      step: 1,
      usage: usage(1_000, 40, 3_000),
      first_token_ms: 600,
      generation_ms: 300,
    }),
    at(2_250, { type: "step_started", session_id: S, turn: 1, step: 2 }),
    at(4_000, {
      type: "assistant_message",
      session_id: S,
      turn: 1,
      step: 2,
      content: [{ type: "text", text: "There are two files." }],
      provider: "google",
      model: "gemini",
      usage: usage(2_000, 10, 3_000),
    }),
    at(4_010, {
      type: "step_ended",
      session_id: S,
      turn: 1,
      step: 2,
      usage: usage(2_000, 10, 3_000),
      first_token_ms: 1_000,
      generation_ms: 500,
    }),
    at(4_020, { type: "turn_ended", session_id: S, turn: 1, reason: { kind: "completed" } }),
    at(5_000, { type: "user_message", session_id: S, text: "Thanks", source: "human" }),
    at(5_010, { type: "turn_started", session_id: S, turn: 2 }),
    at(5_020, { type: "step_started", session_id: S, turn: 2, step: 1 }),
    at(6_000, {
      type: "assistant_message",
      session_id: S,
      turn: 2,
      step: 1,
      content: [{ type: "text", text: "You're welcome." }],
      provider: "google",
      model: "gemini",
      usage: usage(2_100, 5, 0),
    }),
    at(6_010, {
      type: "step_ended",
      session_id: S,
      turn: 2,
      step: 1,
      usage: usage(2_100, 5, 0),
      first_token_ms: 900,
      generation_ms: 80,
    }),
    at(6_020, { type: "turn_ended", session_id: S, turn: 2, reason: { kind: "completed" } }),
  ];
}
