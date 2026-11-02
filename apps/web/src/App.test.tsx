import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket } from "@/test/fake-socket";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    FakeSocket.reset();
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends a message and streams the reply into the session view", async () => {
    render(<App />);
    const socket = FakeSocket.latest();
    act(() => socket.open());

    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "hello{Enter}");
    const { session_id } = JSON.parse(socket.sent[0]);
    expect(screen.getByText("hello")).toBeInTheDocument();

    act(() => {
      socket.emit({ type: "turn_started", session_id });
      socket.emit({ type: "output", session_id, chunk: "Hi " });
    });
    expect(screen.getByText("Hi")).toBeInTheDocument();
    act(() => socket.emit({ type: "output", session_id, chunk: "there" }));
    expect(screen.getByText("Hi there")).toBeInTheDocument();
    act(() => {
      socket.emit({
        type: "tool_call",
        session_id,
        call_id: "t1",
        name: "list_directory",
        args: { path: "src" },
      });
      socket.emit({
        type: "tool_result",
        session_id,
        call_id: "t1",
        output: "main.tsx",
        is_error: false,
      });
    });
    expect(screen.getByText("List")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("main.tsx");
    act(() => socket.emit({ type: "done", session_id }));
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  it("stops a running turn and re-enables the composer", async () => {
    render(<App />);
    const socket = FakeSocket.latest();
    act(() => socket.open());

    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "long task{Enter}");
    const { session_id } = JSON.parse(socket.sent[0]);
    act(() => socket.emit({ type: "turn_started", session_id }));

    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(JSON.parse(socket.sent[1])).toEqual({ type: "interrupt", session_id });

    act(() => socket.emit({ type: "interrupted", session_id }));
    expect(screen.getByText("Turn interrupted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "next");
    expect(screen.getByRole("button", { name: /send message/i })).toBeEnabled();
  });
});
