import type { JsonValue, SessionEvent } from "@/api/types";

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** A tool call the agent made, with its result once it arrives. */
export interface ToolItem {
  id: string;
  role: "tool";
  callId: string;
  name: string;
  args: JsonValue;
  status: "running" | "done" | "error";
  output: string | null;
}

/** A line about the session itself, such as an interrupted turn. */
export interface SessionNotice {
  id: string;
  role: "notice";
  text: string;
}

/** A file the agent changed this session and its diff from before. */
export interface FileChange {
  path: string;
  diff: string;
  additions: number;
  deletions: number;
}

export type SessionItem = SessionMessage | ToolItem | SessionNotice;

export interface SessionState {
  /** The session timeline: messages and tool calls in arrival order. */
  messages: SessionItem[];
  running: boolean;
  error: string | null;
  /** Id of the assistant message the current turn is streaming into. */
  streamingId: string | null;
  /** Files the agent changed, in the order it first edited them. */
  changedFiles: FileChange[];
}

export type SessionAction =
  | { kind: "send"; text: string }
  | { kind: "event"; event: SessionEvent }
  | { kind: "local_error"; message: string };

export const initialSessionState: SessionState = {
  messages: [],
  running: false,
  error: null,
  streamingId: null,
  changedFiles: [],
};

const nextId = (state: SessionState) => `m${state.messages.length}`;

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.kind) {
    case "send":
      // During a turn this steers it; the reply continues in a new message.
      return {
        ...state,
        messages: [...state.messages, { id: nextId(state), role: "user", text: action.text }],
        running: true,
        error: null,
        streamingId: null,
      };
    case "local_error":
      return { ...state, running: false, error: action.message, streamingId: null };
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "turn_started":
      return { ...state, running: true, streamingId: null };
    case "output": {
      if (state.streamingId) {
        const id = state.streamingId;
        return {
          ...state,
          messages: state.messages.map((m) =>
            m.id === id && m.role === "assistant" ? { ...m, text: m.text + event.chunk } : m,
          ),
        };
      }
      const id = nextId(state);
      return {
        ...state,
        streamingId: id,
        messages: [...state.messages, { id, role: "assistant", text: event.chunk }],
      };
    }
    case "tool_call":
      return {
        ...state,
        // Text after a tool call belongs to a new assistant message.
        streamingId: null,
        messages: [
          ...state.messages,
          {
            id: nextId(state),
            role: "tool",
            callId: event.call_id,
            name: event.name,
            args: event.args,
            status: "running",
            output: null,
          },
        ],
      };
    case "tool_result": {
      const found = state.messages.some((m) => m.role === "tool" && m.callId === event.call_id);
      if (!found) return state;
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.role === "tool" && m.callId === event.call_id
            ? { ...m, status: event.is_error ? "error" : "done", output: event.output }
            : m,
        ),
      };
    }
    case "changes_reverted": {
      const count = event.paths.length;
      return {
        ...state,
        changedFiles: [],
        messages: [
          ...state.messages,
          {
            id: nextId(state),
            role: "notice",
            text: `Reverted ${count} ${count === 1 ? "file" : "files"}`,
          },
        ],
      };
    }
    case "file_changed":
      return { ...state, changedFiles: upsertChange(state.changedFiles, event) };
    case "done":
      return { ...state, running: false, streamingId: null };
    case "interrupted":
      return {
        ...state,
        running: false,
        streamingId: null,
        messages: [
          ...state.messages.map((m) =>
            m.role === "tool" && m.status === "running"
              ? { ...m, status: "error" as const, output: "Interrupted" }
              : m,
          ),
          { id: nextId(state), role: "notice", text: "Turn interrupted" },
        ],
      };
    case "error":
      return { ...state, running: false, error: event.message, streamingId: null };
    default:
      return state;
  }
}

function upsertChange(files: FileChange[], event: FileChange): FileChange[] {
  const change = {
    path: event.path,
    diff: event.diff,
    additions: event.additions,
    deletions: event.deletions,
  };
  // An edit that restores the original content leaves nothing to review.
  if (change.diff === "") return files.filter((f) => f.path !== change.path);
  const index = files.findIndex((f) => f.path === change.path);
  if (index === -1) return [...files, change];
  return files.map((f, i) => (i === index ? change : f));
}
