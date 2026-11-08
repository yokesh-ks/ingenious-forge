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

function setupPaged(pageSize: number) {
  return renderHook(() =>
    useSession("s1", { createSocket: createFakeSocket, reconnectDelay: 0, pageSize }),
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
    act(() =>
      FakeSocket.latest().emit({
        type: "user_message",
        session_id: "s1",
        text: "hello",
        source: "human",
      }),
    );
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
      socket.emit({ type: "user_message", session_id: "s1", text: "hi", source: "human" });
      socket.emit({ type: "turn_started", session_id: "s1", turn: 1 });
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
        { seq: 1, ts: 0, type: "turn_started", session_id: "s1", turn: 1 },
        { seq: 2, ts: 0, type: "output", session_id: "s1", chunk: "Earlier reply" },
        { seq: 3, ts: 0, type: "done", session_id: "s1" },
      ],
    });
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    expect(result.current.state.messages).toMatchObject([
      { role: "assistant", text: "Earlier reply" },
    ]);
    expect(result.current.state.running).toBe(false);
  });

  it("opens a long session at its tail and lists every changed file", async () => {
    const fetch = fakeFetch({
      "GET /api/sessions/s1/events": [
        { seq: 7, ts: 0, type: "output", session_id: "s1", chunk: "end of an older turn" },
        { seq: 8, ts: 0, type: "user_message", session_id: "s1", text: "latest", source: "human" },
        { seq: 9, ts: 0, type: "turn_started", session_id: "s1", turn: 4 },
      ],
      "GET /api/sessions/s1/changes": [
        { path: "early.txt", diff: "+x", additions: 1, deletions: 0 },
      ],
    });
    const { result } = setupPaged(3);
    await openSocket(FakeSocket.latest());
    await waitFor(() => expect(result.current.state.changedFiles).toHaveLength(1));

    const url = new URL(String(fetch.mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.has("after")).toBe(false);
    // The page starts at the turn, so the turn shows as running.
    expect(result.current.state.messages).toEqual([{ id: "m0", role: "user", text: "latest" }]);
    expect(result.current.state.running).toBe(true);
    expect(result.current.hasOlder).toBe(true);
  });

  it("loads older pages before the oldest held event until none are left", async () => {
    const pages: Record<string, unknown[]> = {
      "": [
        { seq: 5, ts: 0, type: "user_message", session_id: "s1", text: "third", source: "human" },
        { seq: 6, ts: 0, type: "done", session_id: "s1" },
      ],
      "5": [
        { seq: 3, ts: 0, type: "user_message", session_id: "s1", text: "second", source: "human" },
        { seq: 4, ts: 0, type: "done", session_id: "s1" },
      ],
      "3": [
        { seq: 1, ts: 0, type: "user_message", session_id: "s1", text: "first", source: "human" },
      ],
    };
    const fetch = fakeFetch({
      "GET /api/sessions/s1/events": (_init: unknown, url: URL) => ({
        body: pages[url.searchParams.get("before") ?? ""],
      }),
      "GET /api/sessions/s1/changes": [],
    });
    const { result } = setupPaged(2);
    await openSocket(FakeSocket.latest());
    const texts = () => result.current.state.messages.map((m) => ("text" in m ? m.text : ""));
    expect(texts()).toEqual(["third"]);

    await act(() => result.current.loadOlder());
    expect(texts()).toEqual(["second", "third"]);
    expect(result.current.hasOlder).toBe(true);

    await act(() => result.current.loadOlder());
    expect(texts()).toEqual(["first", "second", "third"]);
    expect(result.current.hasOlder).toBe(false);

    const calls = fetch.mock.calls.length;
    await act(() => result.current.loadOlder());
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it("exposes the events it holds, oldest first", async () => {
    fakeFetch({
      "GET /api/sessions/s1/events": [
        { seq: 1, ts: 5, type: "output", session_id: "s1", chunk: "a" },
      ],
    });
    const { result } = setupPaged(3);
    await openSocket(FakeSocket.latest());
    act(() => FakeSocket.latest().emit({ type: "output", session_id: "s1", chunk: "b" }, 2));
    expect(result.current.events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("does not page a session shorter than one page", async () => {
    fakeFetch({
      "GET /api/sessions/s1/events": [
        { seq: 1, ts: 0, type: "output", session_id: "s1", chunk: "short" },
      ],
    });
    const { result } = setupPaged(3);
    await openSocket(FakeSocket.latest());
    expect(result.current.state.messages).toMatchObject([{ text: "short" }]);
    expect(result.current.hasOlder).toBe(false);
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
        { seq: 1, ts: 0, type: "output", session_id: "s1", chunk: "A" },
        { seq: 2, ts: 0, type: "output", session_id: "s1", chunk: "B" },
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
      first.emit({ type: "user_message", session_id: "s1", text: "hi", source: "human" });
      first.emit({ type: "turn_started", session_id: "s1", turn: 1 });
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
            { seq: 3, ts: 0, type: "output", session_id: "s1", chunk: "missed" },
            { seq: 4, ts: 0, type: "done", session_id: "s1" },
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

  it("sends a question card's answers for its session", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    const answers = [{ id: "color", selected: ["Blue"], custom: "notes" }];
    act(() => result.current.answerQuestion("q1", answers));
    expect(JSON.parse(FakeSocket.latest().sent[0])).toEqual({
      type: "answer_question",
      session_id: "s1",
      call_id: "q1",
      answers,
    });
  });

  it("closes the socket on unmount", async () => {
    const { unmount } = setup();
    const socket = FakeSocket.latest();
    unmount();
    expect(socket.closed).toBe(true);
  });
});
