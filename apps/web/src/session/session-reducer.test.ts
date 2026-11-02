import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@/api/types";
import { initialSessionState, type SessionState, sessionReducer } from "./session-reducer";

const S = "s1";

function apply(state: SessionState, ...events: SessionEvent[]): SessionState {
  return events.reduce((acc, event) => sessionReducer(acc, { kind: "event", event }), state);
}

function sent(text: string, state = initialSessionState): SessionState {
  return sessionReducer(state, { kind: "send", text });
}

describe("sessionReducer", () => {
  it("starts empty and idle", () => {
    expect(initialSessionState).toEqual({
      messages: [],
      running: false,
      error: null,
      streamingId: null,
    });
  });

  it("adds the user's message and marks the turn running", () => {
    const state = sent("hello");
    expect(state.messages).toEqual([{ id: "m0", role: "user", text: "hello" }]);
    expect(state.running).toBe(true);
  });

  it("streams output chunks into one assistant message", () => {
    const state = apply(
      sent("hi"),
      { type: "turn_started", session_id: S },
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
      { type: "turn_started", session_id: S },
      { type: "output", session_id: S, chunk: "A" },
      { type: "done", session_id: S },
    );
    expect(state.running).toBe(false);
    state = apply(
      sent("two", state),
      { type: "turn_started", session_id: S },
      { type: "output", session_id: S, chunk: "B" },
    );
    expect(state.messages.map((m) => [m.role, m.text])).toEqual([
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
    expect(state.messages[state.messages.length - 1]?.text).toBe("par");
  });

  it("clears a previous error when the next message is sent", () => {
    const failed = apply(sent("hi"), { type: "error", session_id: S, message: "x" });
    expect(sent("again", failed).error).toBeNull();
  });

  it("marks running when another tab starts a turn", () => {
    expect(apply(initialSessionState, { type: "turn_started", session_id: S }).running).toBe(true);
  });

  it("ignores events it does not render yet", () => {
    const state = sent("hi");
    expect(apply(state, { type: "tool_call", session_id: S, name: "read", args: {} })).toEqual(
      state,
    );
  });

  it("can record a local error without a server event", () => {
    const state = sessionReducer(sent("hi"), { kind: "local_error", message: "offline" });
    expect(state.error).toBe("offline");
    expect(state.running).toBe(false);
  });
});
