import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "@/api/types";
import SessionView from "@/features/session/components/SessionView";

// Counts tool card renders, so the test can check which entries re-render
// without relying on wall-clock time.
const toolCardRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/features/session/components/ToolCallCard", () => ({
  default: () => {
    toolCardRenders.count++;
    return null;
  },
}));

import { initialSessionState, sessionReducer } from "../session-reducer";

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
      exit_code: null,
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

  it("loads a 4,000-step backlog in linear time", () => {
    // Linear work takes about 0.1 s here; copying the timeline per event
    // (quadratic) took several seconds. The limit leaves room for a busy
    // machine on both sides.
    const events = longSession(4_000);
    const start = performance.now();
    const state = sessionReducer(initialSessionState, { kind: "events", events });
    const elapsed = performance.now() - start;
    expect(state.messages).toHaveLength(1 + 2 * 4_000);
    expect(elapsed).toBeLessThan(1_500);
  });

  it("keeps unchanged entries' identity so the view can skip them", () => {
    const base = sessionReducer(initialSessionState, {
      kind: "events",
      events: longSession(50, 1),
    });
    const next = sessionReducer(base, {
      kind: "event",
      event: { type: "output", session_id: S, chunk: "more" },
    });
    const last = next.messages.length - 1;
    expect(next.messages.slice(0, last).every((m, i) => m === base.messages[i])).toBe(true);
    expect(next.messages[last]).not.toBe(base.messages[last]);
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
    expect(toolCardRenders.count).toBe(1_000);

    const next = sessionReducer(base, {
      kind: "event",
      event: { type: "output", session_id: S, chunk: "more" },
    });
    toolCardRenders.count = 0;
    rerender(<SessionView messages={next.messages} running error={null} />);

    expect(container.textContent).toContain("more");
    expect(toolCardRenders.count).toBe(0);
  });
});
