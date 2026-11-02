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

export type SessionItem = SessionMessage | ToolItem;

export interface SessionState {
  /** The session timeline: messages and tool calls in arrival order. */
  messages: SessionItem[];
  running: boolean;
  error: string | null;
  /** Id of the assistant message the current turn is streaming into. */
  streamingId: string | null;
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
};

const nextId = (state: SessionState) => `m${state.messages.length}`;

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.kind) {
    case "send":
      return {
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
            m.id === id && m.role !== "tool" ? { ...m, text: m.text + event.chunk } : m,
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
    case "done":
      return { ...state, running: false, streamingId: null };
    case "error":
      return { ...state, running: false, error: event.message, streamingId: null };
    default:
      return state;
  }
}
