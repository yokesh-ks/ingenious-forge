import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@/api/types";
import SessionView from "@/components/SessionView";
import { initialSessionState, sessionReducer } from "./session-reducer";

const S = "s1";

/** A session of `steps` agent steps: text streamed in chunks, then a tool
 * call and its result. */
function longSession(steps: number, chunks = 20): SessionEvent[] {
  const events: SessionEvent[] = [
    { type: "user_message", session_id: S, text: "do the big job" },
    { type: "turn_started", session_id: S },
  ];
  for (let i = 0; i < steps; i++) {
    for (let c = 0; c < chunks; c++)
      events.push({ type: "output", session_id: S, chunk: `w${c} ` });
    events.push({
      type: "tool_call",
      session_id: S,
      call_id: `t${i}`,
      name: "read_file",
      args: { path: `f${i}.ts` },
    });
    events.push({
      type: "tool_result",
      session_id: S,
      call_id: `t${i}`,
      output: "ok",
      is_error: false,
    });
  }
  events.push({ type: "done", session_id: S });
  return events;
}

function oneByOne(events: SessionEvent[]) {
  return events.reduce(
    (s, event) => sessionReducer(s, { kind: "event", event }),
    initialSessionState,
  );
}

describe("long sessions", () => {
  it("a batch of events gives the same state as applying them one by one", () => {
    const events = longSession(30, 3);
    const batched = sessionReducer(initialSessionState, { kind: "events", events });
    expect(batched).toEqual(oneByOne(events));
  });

  it("loads a 1,000-step backlog quickly", () => {
    const events = longSession(1_000);
    const start = performance.now();
    const state = sessionReducer(initialSessionState, { kind: "events", events });
    const elapsed = performance.now() - start;
    expect(state.messages).toHaveLength(1 + 2 * 1_000);
    expect(elapsed).toBeLessThan(150);
  });

  it("streams into a long session without copying the whole timeline per chunk", () => {
    let state = sessionReducer(initialSessionState, {
      kind: "events",
      events: longSession(1_000, 1),
    });
    const start = performance.now();
    for (let c = 0; c < 2_000; c++) {
      state = sessionReducer(state, {
        kind: "event",
        event: { type: "output", session_id: S, chunk: "x" },
      });
    }
    expect(performance.now() - start).toBeLessThan(150);
    expect(state.messages[state.messages.length - 1]).toMatchObject({ role: "assistant" });
  });

  it("re-renders only what changed when a chunk arrives in a long session", () => {
    const base = sessionReducer(initialSessionState, {
      kind: "events",
      events: longSession(1_000, 1),
    });
    const { rerender, container } = render(
      <SessionView messages={base.messages} running error={null} />,
    );
    const next = sessionReducer(base, {
      kind: "event",
      event: { type: "output", session_id: S, chunk: "more" },
    });
    const start = performance.now();
    rerender(<SessionView messages={next.messages} running error={null} />);
    const elapsed = performance.now() - start;
    expect(container.textContent).toContain("more");
    expect(elapsed).toBeLessThan(60);
  });
});
