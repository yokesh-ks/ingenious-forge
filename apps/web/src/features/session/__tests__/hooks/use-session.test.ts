import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { createFakeSocket, FakeSocket, openSocket } from "@/test/fake-socket";
import { sessionSocketUrl, useSession } from "../../hooks/use-session";

function setup(sessionId = "s1") {
  return renderHook(
    ({ id }) => useSession(id, { createSocket: createFakeSocket, reconnectDelay: 0 }),
    {
      initialProps: { id: sessionId },
    },
  );
}

describe("sessionSocketUrl", () => {
  it("uses ws for http pages and wss for https pages", async () => {
    expect(sessionSocketUrl({ protocol: "http:", host: "localhost:3000" })).toBe(
      "ws://localhost:3000/ws",
    );
    expect(sessionSocketUrl({ protocol: "https:", host: "forge.test" })).toBe(
      "wss://forge.test/ws",
    );
  });
});

describe("useSession", () => {
  beforeEach(() => {
    FakeSocket.reset();
    fakeFetch({});
  });
  afterEach(() => {
    FakeSocket.reset();
    vi.unstubAllGlobals();
  });

  it("connects to the session socket and reports when it opens", async () => {
    const { result } = setup();
    expect(FakeSocket.latest().url).toMatch(/\/ws$/);
    expect(result.current.connected).toBe(false);
    await openSocket(FakeSocket.latest());
    expect(result.current.connected).toBe(true);
  });

  it("sends a send_message payload and shows the user's message", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());

    let ok = false;
    act(() => {
      ok = result.current.send("  hello  ");
    });

    expect(ok).toBe(true);
    expect(JSON.parse(FakeSocket.latest().sent[0])).toEqual({
      type: "send_message",
      session_id: "s1",
      text: "hello",
    });
    expect(result.current.state.running).toBe(true);
    act(() => FakeSocket.latest().emit({ type: "user_message", session_id: "s1", text: "hello" }));
    expect(result.current.state.messages).toEqual([{ id: "m0", role: "user", text: "hello" }]);
  });

  it("does not send blank messages", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    act(() => {
      expect(result.current.send("   ")).toBe(false);
    });
    expect(FakeSocket.latest().sent).toEqual([]);
  });

  it("reports an error instead of sending while disconnected", async () => {
    const { result } = setup();
    act(() => {
      expect(result.current.send("hi")).toBe(false);
    });
    expect(FakeSocket.latest().sent).toEqual([]);
    expect(result.current.state.error).toMatch(/not connected/i);
  });

  it("applies streamed events for its own session only", async () => {
    const { result } = setup();
    const socket = FakeSocket.latest();
    await openSocket(socket);
    act(() => {
      result.current.send("hi");
      socket.emit({ type: "user_message", session_id: "s1", text: "hi" });
      socket.emit({ type: "turn_started", session_id: "s1" });
      socket.emit({ type: "output", session_id: "other", chunk: "nope" });
      socket.emit({ type: "output", session_id: "s1", chunk: "Hi!" });
      socket.emit({ type: "done", session_id: "s1" });
    });
    expect(result.current.state.messages.map((m) => ("text" in m ? m.text : m.name))).toEqual([
      "hi",
      "Hi!",
    ]);
    expect(result.current.state.running).toBe(false);
  });

  it("ignores malformed frames", async () => {
    const { result } = setup();
    const socket = FakeSocket.latest();
    await openSocket(socket);
    act(() => {
      socket.emitRaw("{not json");
      socket.emitRaw(JSON.stringify({ hello: "world" }));
    });
    expect(result.current.state.messages).toEqual([]);
    expect(result.current.state.error).toBeNull();
  });

  it("loads the session's logged events when it connects", async () => {
    fakeFetch({
      "GET /api/sessions/s1/events": [
        { seq: 1, type: "turn_started", session_id: "s1" },
        { seq: 2, type: "output", session_id: "s1", chunk: "Earlier reply" },
        { seq: 3, type: "done", session_id: "s1" },
      ],
    });
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    expect(result.current.state.messages).toMatchObject([
      { role: "assistant", text: "Earlier reply" },
    ]);
    expect(result.current.state.running).toBe(false);
  });

  it("loads a long backlog quickly", async () => {
    const backlog = [];
    let seq = 0;
    for (let i = 0; i < 1_000; i++) {
      for (let c = 0; c < 20; c++)
        backlog.push({ seq: ++seq, type: "output", session_id: "s1", chunk: "w " });
      backlog.push({
        seq: ++seq,
        type: "tool_call",
        session_id: "s1",
        call_id: `t${i}`,
        name: "read_file",
        args: {},
      });
    }
    fakeFetch({ "GET /api/sessions/s1/events": backlog });
    const { result } = setup();
    const start = performance.now();
    await openSocket(FakeSocket.latest());
    // A loose guard against pathological slowdowns; about 60 ms when idle.
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(result.current.state.messages).toHaveLength(2_000);
  });

  it("applies overlapping backlog and live frames once, in order", async () => {
    let release: (body: unknown) => void = () => {};
    const backlog = new Promise((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(await backlog))),
    );
    const { result } = setup();
    const socket = FakeSocket.latest();
    act(() => socket.open());
    // Live frames arrive while the backlog request is still running.
    act(() => {
      socket.emit({ type: "output", session_id: "s1", chunk: "B" }, 2);
      socket.emit({ type: "output", session_id: "s1", chunk: "C" }, 3);
    });
    await act(async () => {
      release([
        { seq: 1, type: "output", session_id: "s1", chunk: "A" },
        { seq: 2, type: "output", session_id: "s1", chunk: "B" },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.state.messages).toMatchObject([{ text: "ABC" }]);
  });

  it("ignores a frame it has already applied", async () => {
    const { result } = setup();
    const socket = FakeSocket.latest();
    await openSocket(socket);
    act(() => {
      socket.emit({ type: "output", session_id: "s1", chunk: "x" }, 1);
      socket.emit({ type: "output", session_id: "s1", chunk: "x" }, 1);
    });
    expect(result.current.state.messages).toMatchObject([{ text: "x" }]);
  });

  it("reconnects after a drop and catches up on what it missed", async () => {
    const { result } = setup();
    const first = FakeSocket.latest();
    await openSocket(first);
    act(() => {
      result.current.send("hi");
      first.emit({ type: "user_message", session_id: "s1", text: "hi" });
      first.emit({ type: "turn_started", session_id: "s1" });
    });

    act(() => first.drop());
    expect(result.current.connected).toBe(false);
    expect(result.current.state.running).toBe(true);
    expect(result.current.state.error).toBeNull();

    fakeFetch({
      "GET /api/sessions/s1/events": (_init: unknown, url: URL) => {
        expect(url.searchParams.get("after")).toBe("2");
        return {
          body: [
            { seq: 3, type: "output", session_id: "s1", chunk: "missed" },
            { seq: 4, type: "done", session_id: "s1" },
          ],
        };
      },
    });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    await openSocket(FakeSocket.latest());

    expect(result.current.connected).toBe(true);
    expect(result.current.state.messages.map((m) => ("text" in m ? m.text : ""))).toEqual([
      "hi",
      "missed",
    ]);
    expect(result.current.state.running).toBe(false);
  });

  it("sends an interrupt for its session when stopped", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    act(() => result.current.stop());
    expect(JSON.parse(FakeSocket.latest().sent[0])).toEqual({
      type: "interrupt",
      session_id: "s1",
    });
  });

  it("does nothing when stopped while disconnected", async () => {
    const { result } = setup();
    act(() => result.current.stop());
    expect(FakeSocket.latest().sent).toEqual([]);
  });

  it("sends revert_all for its session", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    act(() => result.current.revertAll());
    expect(JSON.parse(FakeSocket.latest().sent[0])).toEqual({
      type: "revert_all",
      session_id: "s1",
    });
  });

  it("sends an approval answer for its session", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    act(() => result.current.answerApproval("t1", "always_allow"));
    expect(JSON.parse(FakeSocket.latest().sent[0])).toEqual({
      type: "answer_approval",
      session_id: "s1",
      call_id: "t1",
      decision: "always_allow",
    });
  });

  it("closes the socket on unmount", async () => {
    const { unmount } = setup();
    const socket = FakeSocket.latest();
    unmount();
    expect(socket.closed).toBe(true);
  });
});
