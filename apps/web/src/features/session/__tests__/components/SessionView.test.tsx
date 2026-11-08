import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionItem } from "@/features/session/session-reducer";
import SessionView from "../../components/SessionView";

const conversation: SessionItem[] = [
  { id: "m0", role: "user", text: "hi" },
  { id: "m1", role: "assistant", text: "Hello there" },
];

describe("SessionView", () => {
  it("shows the empty state when there are no messages", () => {
    render(<SessionView messages={[]} running={false} error={null} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("renders user and assistant messages in order", () => {
    render(<SessionView messages={conversation} running={false} error={null} />);
    const texts = screen.getAllByTestId("message-text").map((el) => el.textContent);
    expect(texts).toEqual(["hi", "Hello there"]);
  });

  it("renders assistant replies as Markdown and user text literally", () => {
    render(
      <SessionView
        messages={[
          { id: "u", role: "user", text: "**not bold**" },
          { id: "a", role: "assistant", text: "### Integration\n\nUses **two** parts." },
        ]}
        running={false}
        error={null}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Integration" })).toBeInTheDocument();
    expect(screen.getByText("two").tagName).toBe("STRONG");
    expect(screen.getByText("**not bold**")).toBeInTheDocument();
  });

  it("shows a thinking indicator while waiting for the first token", () => {
    render(<SessionView messages={conversation.slice(0, 1)} running error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/thinking/i);
  });

  it("hides the thinking indicator once the reply is streaming", () => {
    render(<SessionView messages={conversation} running error={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders tool calls inline between messages", async () => {
    render(
      <SessionView
        messages={[
          ...conversation,
          {
            id: "m2",
            role: "tool",
            callId: "t1",
            name: "read_file",
            args: { path: "README.md" },
            status: "done",
            output: "# Forge",
            lines: [],
            hiddenLines: 0,
            exitCode: null,
            approval: null,
            question: null,
            todos: null,
            meta: null,
          },
        ]}
        running={false}
        error={null}
      />,
    );
    // The call sits in a closed group, as a row under its title.
    await userEvent.click(screen.getByRole("button", { name: "Read files" }));
    await userEvent.click(screen.getByRole("button", { name: "Read · README.md" }));
    expect(screen.getByTestId("tool-output")).toHaveTextContent("# Forge");
  });

  it("shows the thinking indicator after a tool finishes mid-turn", () => {
    render(
      <SessionView
        messages={[
          conversation[0],
          {
            id: "m1",
            role: "tool",
            callId: "t1",
            name: "list_directory",
            args: {},
            status: "done",
            output: "a",
            lines: [],
            hiddenLines: 0,
            exitCode: null,
            approval: null,
            question: null,
            todos: null,
            meta: null,
          },
        ]}
        running
        error={null}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/thinking/i);
  });

  it("passes a question card's answers up with its call id", async () => {
    const onAnswerQuestion = vi.fn();
    render(
      <SessionView
        messages={[
          conversation[0],
          {
            id: "m1",
            role: "tool",
            callId: "q1",
            name: "ask_user_question",
            args: {},
            status: "running",
            output: null,
            lines: [],
            hiddenLines: 0,
            exitCode: null,
            approval: null,
            meta: null,
            question: {
              questions: [
                { id: "go", question: "Go on?", header: null, options: [], multi_select: false },
              ],
              answers: null,
              status: "pending",
            },
            todos: null,
          },
        ]}
        running
        error={null}
        onAnswerQuestion={onAnswerQuestion}
      />,
    );
    // The turn waits on the user, not the model.
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Other answer" }), "yes");
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(onAnswerQuestion).toHaveBeenCalledWith("q1", [
      { id: "go", selected: [], custom: "yes" },
    ]);
  });

  it("offers to load earlier messages when older events exist", async () => {
    const onLoadOlder = vi.fn();
    const { rerender } = render(
      <SessionView
        messages={conversation}
        running={false}
        error={null}
        hasOlder
        onLoadOlder={onLoadOlder}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(onLoadOlder).toHaveBeenCalled();
    rerender(
      <SessionView
        messages={conversation}
        running={false}
        error={null}
        hasOlder
        loadingOlder
        onLoadOlder={onLoadOlder}
      />,
    );
    expect(screen.getByRole("button", { name: /Loading earlier messages/ })).toBeDisabled();
    rerender(<SessionView messages={conversation} running={false} error={null} />);
    expect(screen.queryByRole("button", { name: /earlier messages/ })).not.toBeInTheDocument();
  });

  it("shows a running turn's rows directly and its status below them", () => {
    render(
      <SessionView
        messages={[
          conversation[0],
          {
            id: "m1",
            role: "tool",
            callId: "t1",
            name: "bash",
            args: { command: "ls", description: "List files" },
            status: "running",
            output: null,
            lines: [],
            hiddenLines: 0,
            exitCode: null,
            approval: null,
            meta: null,
            question: null,
            todos: null,
          },
        ]}
        turns={[{ turn: 1, start: 1, startedAt: null, endedAt: null, status: "running" }]}
        running
        error={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Bash · List files" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Running commands" })).not.toBeInTheDocument();
    // One status line: the turn's, not the generic one.
    expect(screen.getByRole("status")).toHaveTextContent(/^Deep diving/);
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("shows notices such as an interrupted turn", () => {
    render(
      <SessionView
        messages={[...conversation, { id: "m2", role: "notice", text: "Turn interrupted" }]}
        running={false}
        error={null}
      />,
    );
    expect(screen.getByText("Turn interrupted")).toBeInTheDocument();
  });

  it("shows an error alert", () => {
    render(<SessionView messages={conversation} running={false} error="no key" />);
    expect(screen.getByRole("alert")).toHaveTextContent("no key");
  });

  it("shows an error even before any message exists", () => {
    render(<SessionView messages={[]} running={false} error="offline" />);
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
  });
});
