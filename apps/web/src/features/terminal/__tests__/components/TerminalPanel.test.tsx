import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, openSocket } from "@/test/fake-socket";

/** The xterm.js terminal, replaced so tests can see what it was given. */
const xterm = vi.hoisted(() => ({
  instances: [] as {
    written: string[];
    opened: boolean;
    disposed: boolean;
    type: (data: string) => void;
  }[],
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    written: string[] = [];
    opened = false;
    disposed = false;
    cols = 80;
    rows = 24;
    private listener: ((data: string) => void) | null = null;
    constructor() {
      xterm.instances.push(this);
    }
    open() {
      this.opened = true;
    }
    loadAddon() {}
    write(data: Uint8Array | string) {
      this.written.push(typeof data === "string" ? data : new TextDecoder().decode(data));
    }
    onData(listener: (data: string) => void) {
      this.listener = listener;
      return { dispose() {} };
    }
    type(data: string) {
      this.listener?.(data);
    }
    dispose() {
      this.disposed = true;
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

const { default: TerminalPanel } = await import("../../components/TerminalPanel");

describe("TerminalPanel", () => {
  beforeEach(() => {
    FakeSocket.reset();
    xterm.instances.length = 0;
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the shell's output and sends what the user types", async () => {
    render(<TerminalPanel projectId="p1" />);
    const term = xterm.instances[0];
    expect(term.opened).toBe(true);
    const socket = FakeSocket.latest();
    await openSocket(socket);

    act(() => socket.emitBinary("$ "));
    expect(term.written.join("")).toBe("$ ");
    act(() => term.type("ls\r"));
    expect(JSON.parse(socket.sent[socket.sent.length - 1])).toEqual({
      type: "input",
      data: "ls\r",
    });
  });

  it("offers a restart after the shell exits", async () => {
    render(<TerminalPanel projectId="p1" />);
    const socket = FakeSocket.latest();
    await openSocket(socket);
    act(() => socket.emitRaw(JSON.stringify({ type: "exit" })));

    expect(screen.getByText(/shell exited/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(FakeSocket.latest()).not.toBe(socket);
  });

  it("disposes the terminal when it closes", () => {
    const { unmount } = render(<TerminalPanel projectId="p1" />);
    unmount();
    expect(xterm.instances[0].disposed).toBe(true);
  });
});
