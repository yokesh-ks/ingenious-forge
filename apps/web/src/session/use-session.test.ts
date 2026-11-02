import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeSocket, FakeSocket } from "@/test/fake-socket";
import { sessionSocketUrl, useSession } from "./use-session";

function setup(sessionId = "s1") {
  return renderHook(({ id }) => useSession(id, { createSocket: createFakeSocket }), {
    initialProps: { id: sessionId },
  });
}

describe("sessionSocketUrl", () => {
  it("uses ws for http pages and wss for https pages", () => {
    expect(sessionSocketUrl({ protocol: "http:", host: "localhost:3000" })).toBe(
      "ws://localhost:3000/ws",
    );
    expect(sessionSocketUrl({ protocol: "https:", host: "forge.test" })).toBe(
      "wss://forge.test/ws",
    );
  });
});

describe("useSession", () => {
  beforeEach(() => FakeSocket.reset());
  afterEach(() => FakeSocket.reset());

  it("connects to the session socket and reports when it opens", () => {
    const { result } = setup();
    expect(FakeSocket.latest().url).toMatch(/\/ws$/);
    expect(result.current.connected).toBe(false);
    act(() => FakeSocket.latest().open());
    expect(result.current.connected).toBe(true);
  });

  it("sends a send_message payload and shows the user's message", () => {
    const { result } = setup();
    act(() => FakeSocket.latest().open());

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
    expect(result.current.state.messages).toEqual([{ id: "m0", role: "user", text: "hello" }]);
    expect(result.current.state.running).toBe(true);
  });

  it("does not send blank messages", () => {
    const { result } = setup();
    act(() => FakeSocket.latest().open());
    act(() => {
      expect(result.current.send("   ")).toBe(false);
    });
    expect(FakeSocket.latest().sent).toEqual([]);
  });

  it("reports an error instead of sending while disconnected", () => {
    const { result } = setup();
    act(() => {
      expect(result.current.send("hi")).toBe(false);
    });
    expect(FakeSocket.latest().sent).toEqual([]);
    expect(result.current.state.error).toMatch(/not connected/i);
  });

  it("applies streamed events for its own session only", () => {
    const { result } = setup();
    const socket = FakeSocket.latest();
    act(() => socket.open());
    act(() => {
      result.current.send("hi");
      socket.emit({ type: "turn_started", session_id: "s1" });
      socket.emit({ type: "output", session_id: "other", chunk: "nope" });
      socket.emit({ type: "output", session_id: "s1", chunk: "Hi!" });
      socket.emit({ type: "done", session_id: "s1" });
    });
    expect(result.current.state.messages.map((m) => (m.role === "tool" ? m.name : m.text))).toEqual(
      ["hi", "Hi!"],
    );
    expect(result.current.state.running).toBe(false);
  });

  it("ignores malformed frames", () => {
    const { result } = setup();
    const socket = FakeSocket.latest();
    act(() => socket.open());
    act(() => {
      socket.emitRaw("{not json");
      socket.emitRaw(JSON.stringify({ hello: "world" }));
    });
    expect(result.current.state.messages).toEqual([]);
    expect(result.current.state.error).toBeNull();
  });

  it("marks a running turn as failed when the connection drops", () => {
    const { result } = setup();
    const socket = FakeSocket.latest();
    act(() => socket.open());
    act(() => {
      result.current.send("hi");
    });
    act(() => socket.drop());
    expect(result.current.connected).toBe(false);
    expect(result.current.state.running).toBe(false);
    expect(result.current.state.error).toMatch(/connection/i);
  });

  it("closes the socket on unmount", () => {
    const { unmount } = setup();
    const socket = FakeSocket.latest();
    unmount();
    expect(socket.closed).toBe(true);
  });
});
