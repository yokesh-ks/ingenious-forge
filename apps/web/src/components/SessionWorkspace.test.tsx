import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, openSocket } from "@/test/fake-socket";
import SessionWorkspace from "./SessionWorkspace";

describe("SessionWorkspace", () => {
  beforeEach(() => {
    FakeSocket.reset();
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("says when it is not connected to the server", async () => {
    render(<SessionWorkspace sessionId="s1" />);
    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
    await openSocket(FakeSocket.latest());
    expect(screen.queryByText(/connecting/i)).not.toBeInTheDocument();
  });

  it("sends a message and streams the reply into the session view", async () => {
    render(<SessionWorkspace sessionId="s1" />);
    const socket = FakeSocket.latest();
    await openSocket(socket);

    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "hello{Enter}");
    const { session_id } = JSON.parse(socket.sent[0]);
    act(() => socket.emit({ type: "user_message", session_id, text: "hello" }));
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
    act(() =>
      socket.emit({
        type: "file_changed",
        session_id,
        path: "src/main.tsx",
        diff: "@@ -1 +1 @@\n-a\n+b\n",
        additions: 1,
        deletions: 1,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /src\/main\.tsx/ }));
    expect(screen.getAllByTestId("diff-line").map((l) => l.textContent)).toContain("+b");
    act(() => socket.emit({ type: "done", session_id }));
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  it("stops a running turn and re-enables the composer", async () => {
    render(<SessionWorkspace sessionId="s1" />);
    const socket = FakeSocket.latest();
    await openSocket(socket);

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

  it("reverts all changes from the panel", async () => {
    render(<SessionWorkspace sessionId="s1" />);
    const socket = FakeSocket.latest();
    await openSocket(socket);
    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "edit{Enter}");
    const { session_id } = JSON.parse(socket.sent[0]);
    act(() => {
      socket.emit({
        type: "file_changed",
        session_id,
        path: "a.txt",
        diff: "@@ -1 +1 @@\n-a\n+b\n",
        additions: 1,
        deletions: 1,
      });
      socket.emit({ type: "done", session_id });
    });

    await userEvent.click(screen.getByRole("button", { name: "Revert all" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm revert/i }));
    expect(JSON.parse(socket.sent[1])).toEqual({ type: "revert_all", session_id });

    act(() => socket.emit({ type: "changes_reverted", session_id, paths: ["a.txt"] }));
    expect(screen.getByText("Reverted 1 file")).toBeInTheDocument();
    expect(screen.getByText(/no changes yet/i)).toBeInTheDocument();
  });
});
