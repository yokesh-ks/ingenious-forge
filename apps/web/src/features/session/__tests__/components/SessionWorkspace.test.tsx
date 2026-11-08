import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "@/features/session/session-reducer";
import SessionWorkspace from "../../components/SessionWorkspace";

const emptyState: SessionState = {
  messages: [],
  running: false,
  error: null,
  streamingId: null,
  changedFiles: [],
  turns: [],
};

function renderWorkspace(overrides: Partial<SessionState> = {}, connected = true) {
  const onSend = vi.fn().mockReturnValue(true);
  const onStop = vi.fn();
  const onAnswerApproval = vi.fn();
  render(
    <SessionWorkspace
      state={{ ...emptyState, ...overrides }}
      connected={connected}
      onSend={onSend}
      onStop={onStop}
      onAnswerApproval={onAnswerApproval}
    />,
  );
  return { onSend, onStop, onAnswerApproval };
}

describe("SessionWorkspace", () => {
  it("says when it is not connected to the server", () => {
    renderWorkspace({}, false);
    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
  });

  it("hides the connecting notice once connected", () => {
    renderWorkspace({}, true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the session's messages", () => {
    renderWorkspace({
      messages: [
        { id: "m1", role: "user", text: "fix the typo" },
        { id: "m2", role: "assistant", text: "Fixed." },
      ],
    });
    expect(screen.getByText("fix the typo")).toBeInTheDocument();
    expect(screen.getByText("Fixed.")).toBeInTheDocument();
  });

  it("sends a typed message and clears the composer", async () => {
    const { onSend } = renderWorkspace();
    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(screen.getByPlaceholderText(/ask forge/i)).toHaveValue("");
  });

  it("stops a running turn", async () => {
    const { onStop } = renderWorkspace({ running: true });
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it("answers an approval card from the session view", async () => {
    const { onAnswerApproval } = renderWorkspace({
      running: true,
      messages: [
        {
          id: "t1",
          role: "tool",
          callId: "t1",
          name: "run_shell",
          args: { command: "ls" },
          status: "running",
          output: null,
          lines: [],
          hiddenLines: 0,
          exitCode: null,
          approval: { kind: "command", command: "ls", path: null, diff: null, status: "pending" },
          meta: null,
          question: null,
          todos: null,
        },
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onAnswerApproval).toHaveBeenCalledWith("t1", "approve");
  });
});
