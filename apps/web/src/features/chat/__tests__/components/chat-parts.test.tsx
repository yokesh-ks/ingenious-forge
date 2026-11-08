import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReasoningItem, ToolItem } from "@/features/session/session-reducer";
import ChatRow from "../../components/ChatRow";
import FailureRow from "../../components/FailureRow";
import ProcessGroup from "../../components/ProcessGroup";
import TurnControl, { RunningStatus } from "../../components/TurnControl";
import type { ChatGroup, ChatTurn } from "../../model/build-chat";

function tool(overrides: Partial<ToolItem>): ToolItem {
  return {
    id: "m1",
    role: "tool",
    callId: "t1",
    name: "read",
    args: { file_path: "/p/README.md" },
    status: "done",
    output: "# Title",
    lines: [],
    hiddenLines: 0,
    exitCode: null,
    approval: null,
    meta: null,
    question: null,
    todos: null,
    ...overrides,
  };
}

const think: ReasoningItem = {
  id: "m0",
  role: "reasoning",
  text: "The user wants me to:\n\n- list **files**",
};

function turn(overrides: Partial<ChatTurn>): ChatTurn {
  return {
    kind: "turn",
    turn: 1,
    status: "completed",
    startedAt: 1_000,
    durationMs: 17_000,
    collapsible: true,
    nodes: [],
    failure: null,
    ...overrides,
  };
}

describe("TurnControl", () => {
  afterEach(() => vi.useRealTimers());

  it("folds and unfolds a completed turn", async () => {
    const onToggle = vi.fn();
    render(<TurnControl turn={turn({})} folded onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Completed in 17s" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it("says Completed with no duration when its start is unknown", () => {
    render(<TurnControl turn={turn({ durationMs: null })} folded={false} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Completed" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows nothing above a running turn; its status sits below it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(6_000);
    const running = turn({ status: "running", durationMs: null, collapsible: false });
    const { container } = render(<TurnControl turn={running} folded={false} onToggle={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    render(<RunningStatus startedAt={1_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("Deep diving for 5s");
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toHaveTextContent("Deep diving for 1m 5s");
  });

  it("says Deep diving without a time when the start is unknown", () => {
    render(<RunningStatus startedAt={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Deep diving/);
    expect(screen.getByRole("status")).not.toHaveTextContent("for");
  });

  it("shows failed and stopped turns without a fold button", () => {
    const { rerender } = render(
      <TurnControl
        turn={turn({ status: "failed", collapsible: false })}
        folded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(
      <TurnControl
        turn={turn({ status: "stopped", collapsible: false })}
        folded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });
});

function group(overrides: Partial<ChatGroup>): ChatGroup {
  return {
    kind: "group",
    id: "m0",
    items: [think, tool({})],
    activity: "read",
    title: "Read files",
    running: false,
    waiting: false,
    ...overrides,
  };
}

describe("ProcessGroup", () => {
  it("starts closed when finished and opens to show its rows", async () => {
    render(<ProcessGroup group={group({})} />);
    const header = screen.getByRole("button", { name: "Read files" });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header).toHaveAttribute("data-activity", "read");
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    const body = document.getElementById(header.getAttribute("aria-controls") ?? "");
    expect(body).toHaveTextContent("README.md");
  });

  it("shows its rows with no header in a running turn", () => {
    render(<ProcessGroup group={group({ running: true, title: "Reading files" })} live />);
    expect(screen.queryByRole("button", { name: "Reading files" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Read/ })).toBeInTheDocument();
  });

  it("is open while running or waiting for the user", () => {
    const { rerender } = render(
      <ProcessGroup group={group({ running: true, title: "Reading files" })} />,
    );
    expect(screen.getByRole("button", { name: "Reading files" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    rerender(<ProcessGroup group={group({ waiting: true })} />);
    expect(screen.getByRole("button", { name: "Read files" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("ChatRow", () => {
  it("shows a tool's name and detail and toggles its body on click", async () => {
    render(
      <ChatRow
        item={tool({
          name: "bash",
          args: { command: "ls", description: "List top-level project files" },
          output: "a\nb",
        })}
      />,
    );
    const row = screen.getByRole("button", { name: /Bash · List top-level project files/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a file from its link without toggling the row", async () => {
    const onOpenFile = vi.fn();
    render(<ChatRow item={tool({})} onOpenFile={onOpenFile} />);
    await userEvent.click(screen.getByRole("button", { name: "README.md" }));
    expect(onOpenFile).toHaveBeenCalledWith("/p/README.md");
    expect(screen.getByRole("button", { name: /^Read/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows no file link for a failed call", () => {
    render(
      <ChatRow item={tool({ status: "error", output: "no such file" })} onOpenFile={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "README.md" })).not.toBeInTheDocument();
    expect(screen.getByText(/README\.md/)).toBeInTheDocument();
  });

  it("toggles with the keyboard", async () => {
    render(<ChatRow item={tool({})} />);
    const row = screen.getByRole("button", { name: /^Read/ });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(row).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("shows reasoning by its first line and all of it as Markdown when open", async () => {
    render(<ChatRow item={think} />);
    const row = screen.getByRole("button", { name: /Think · The user wants me to:/ });
    await userEvent.click(row);
    expect(screen.getByText("files").tagName).toBe("STRONG");
  });

  it("opens a row whose card waits for the user", () => {
    render(
      <ChatRow
        item={tool({
          name: "bash",
          args: { command: "rm x" },
          status: "running",
          output: null,
          approval: { kind: "command", command: "rm x", path: null, diff: null, status: "pending" },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /Bash · rm x/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("region", { name: /approval needed/i })).toBeInTheDocument();
  });
});

describe("FailureRow", () => {
  it("says the turn failed, why, and its code", () => {
    render(<FailureRow failure={{ code: "PROVIDER_ERROR", message: "rate limited" }} />);
    const row = screen.getByRole("alert");
    expect(row).toHaveTextContent("This turn failed rate limited");
    expect(row).toHaveTextContent("PROVIDER_ERROR");
  });
});

describe("context rows", () => {
  it("shows what was injected and opens to its text", async () => {
    render(
      <ChatRow
        item={{
          id: "c1",
          role: "context",
          kind: "system-prompt",
          summary: "AGENTS.md",
          text: "Be brief.",
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Context injection · AGENTS.md" }));
    expect(screen.getByText("Be brief.")).toBeInTheDocument();
  });
});
