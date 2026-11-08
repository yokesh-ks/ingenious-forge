import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, openSocket } from "@/test/fake-socket";
import { terminalSocketUrl, useTerminal } from "../../hooks/use-terminal";

const createSocket = (url: string) => new FakeSocket(url) as unknown as WebSocket;

function setup(onOutput = vi.fn()) {
  const hook = renderHook(() => useTerminal("p 1", onOutput, { createSocket }));
  return { ...hook, onOutput };
}

describe("terminalSocketUrl", () => {
  it("names the shell a new terminal runs", () => {
    expect(terminalSocketUrl({ protocol: "http:", host: "h" }, "p1", "t-1", "/bin/bash")).toBe(
      "ws://h/api/projects/p1/terminal?tab=t-1&shell=%2Fbin%2Fbash",
    );
  });

  it("names a panel tab's own shell", () => {
    expect(terminalSocketUrl({ protocol: "http:", host: "h" }, "p1", "terminal-2")).toBe(
      "ws://h/api/projects/p1/terminal?tab=terminal-2",
    );
  });

  it("uses ws for http and wss for https", () => {
    expect(terminalSocketUrl({ protocol: "http:", host: "localhost:3000" }, "p1")).toBe(
      "ws://localhost:3000/api/projects/p1/terminal",
    );
    expect(terminalSocketUrl({ protocol: "https:", host: "x.dev" }, "a b")).toBe(
      "wss://x.dev/api/projects/a%20b/terminal",
    );
  });
});

describe("useTerminal", () => {
  beforeEach(() => FakeSocket.reset());

  it("connects to the project's terminal and reports when it is open", async () => {
    const { result } = setup();
    expect(result.current.status).toBe("connecting");
    expect(FakeSocket.latest().url).toMatch(/\/api\/projects\/p%201\/terminal$/);
    await openSocket(FakeSocket.latest());
    expect(result.current.status).toBe("open");
  });

  it("passes output bytes on as they arrive", async () => {
    const { onOutput } = setup();
    await openSocket(FakeSocket.latest());
    act(() => FakeSocket.latest().emitBinary("hello"));
    expect(new TextDecoder().decode(onOutput.mock.calls[0][0])).toBe("hello");
  });

  it("sends keystrokes and resizes", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    act(() => {
      result.current.send("ls\r");
      result.current.resize(120, 40);
    });
    expect(FakeSocket.latest().sent.map((s) => JSON.parse(s))).toEqual([
      { type: "input", data: "ls\r" },
      { type: "resize", cols: 120, rows: 40 },
    ]);
  });

  it("sends nothing before the socket opens", () => {
    const { result } = setup();
    act(() => result.current.send("x"));
    expect(FakeSocket.latest().sent).toEqual([]);
  });

  it("reports an exited shell and starts a new one on restart", async () => {
    const { result } = setup();
    const first = FakeSocket.latest();
    await openSocket(first);
    act(() => first.emitRaw(JSON.stringify({ type: "exit" })));
    expect(result.current.status).toBe("exited");

    act(() => result.current.restart());
    expect(first.closed).toBe(true);
    expect(FakeSocket.latest()).not.toBe(first);
    expect(result.current.status).toBe("connecting");
  });

  it("reports a dropped connection", async () => {
    const { result } = setup();
    await openSocket(FakeSocket.latest());
    act(() => FakeSocket.latest().drop());
    expect(result.current.status).toBe("closed");
  });

  it("closes the socket on unmount without killing the shell", () => {
    const { unmount } = setup();
    const socket = FakeSocket.latest();
    unmount();
    expect(socket.closed).toBe(true);
    expect(socket.sent).toEqual([]);
  });
});
