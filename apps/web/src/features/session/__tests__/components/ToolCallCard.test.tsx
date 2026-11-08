import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuestionAnswer } from "@/api/types";
import type { ToolItem } from "@/features/session/session-reducer";
import ToolCallCard from "../../components/ToolCallCard";

function tool(overrides: Partial<ToolItem>): ToolItem {
  return {
    id: "m1",
    role: "tool",
    callId: "t1",
    name: "read_file",
    args: { path: "src/main.rs" },
    status: "done",
    output: "fn main() {}",
    lines: [],
    hiddenLines: 0,
    exitCode: null,
    approval: null,
    question: null,
    todos: null,
    meta: null,
    ...overrides,
  };
}

describe("ToolCallCard", () => {
  describe("current tool names", () => {
    it("shows a read's file and its lines from the result details", () => {
      render(
        <ToolCallCard
          tool={tool({
            name: "read",
            args: { file_path: "README.md" },
            output:
              "<path>/p/README.md</path>\n<type>file</type>\n<content>\n1: # Title\n2: body\n</content>",
            meta: {
              path: "/p/README.md",
              offset: 1,
              lines: [
                { number: 1, text: "# Title" },
                { number: 2, text: "body" },
              ],
              total_lines: 2,
            },
          })}
        />,
      );
      expect(screen.getByText("Read")).toBeInTheDocument();
      expect(screen.getByText("README.md")).toBeInTheDocument();
      const preview = screen.getByTestId("tool-output");
      expect(preview).toHaveTextContent("# Title");
      expect(preview).not.toHaveTextContent("<path>");
    });

    it("shows a bash call by its description, with the command below", () => {
      render(
        <ToolCallCard
          tool={tool({
            name: "bash",
            args: { command: "ls -la", description: "List top-level project files" },
            status: "done",
            output: "a.txt",
            lines: [{ stream: "stdout", text: "a.txt" }],
            exitCode: 0,
          })}
        />,
      );
      expect(screen.getByText("Shell")).toBeInTheDocument();
      expect(screen.getByText("List top-level project files")).toBeInTheDocument();
      expect(screen.getByTestId("shell-command")).toHaveTextContent("ls -la");
    });

    it("labels searches by pattern and fetches by URL", () => {
      const { unmount } = render(
        <ToolCallCard
          tool={tool({ name: "grep", args: { pattern: "TODO" }, output: "a.ts\n1: TODO" })}
        />,
      );
      expect(screen.getByText("Search")).toBeInTheDocument();
      expect(screen.getByText("TODO")).toBeInTheDocument();
      unmount();
      render(
        <ToolCallCard
          tool={tool({ name: "web_fetch", args: { url: "https://example.com" }, output: "x" })}
        />,
      );
      expect(screen.getByText("Fetch")).toBeInTheDocument();
      expect(screen.getByText("https://example.com")).toBeInTheDocument();
    });

    it("labels write and edit by their file", () => {
      render(
        <ToolCallCard
          tool={tool({
            name: "write",
            args: { file_path: "new.txt", content: "x" },
            output: "Created new.txt (+1 −0 lines)",
          })}
        />,
      );
      expect(screen.getByText("Write")).toBeInTheDocument();
      expect(screen.getByText("new.txt")).toBeInTheDocument();
    });
  });

  it("shows a Read card with the path and a content preview", () => {
    render(<ToolCallCard tool={tool({})} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("src/main.rs")).toBeInTheDocument();
    expect(screen.getByTestId("tool-output")).toHaveTextContent("fn main() {}");
  });

  it("limits the Read preview and says how much is hidden", () => {
    const output = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    render(<ToolCallCard tool={tool({ output })} />);
    const preview = screen.getByTestId("tool-output");
    expect(preview).toHaveTextContent("line 12");
    expect(preview).not.toHaveTextContent("line 13");
    expect(screen.getByText("… 18 more lines")).toBeInTheDocument();
  });

  it("shows an Edit card with the path and the change summary", () => {
    render(
      <ToolCallCard
        tool={tool({
          name: "edit_file",
          args: { path: "a.txt", old_string: "x", new_string: "y" },
          output: "Edited a.txt: replaced 1 occurrence (+1 −1 lines)",
        })}
      />,
    );
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByTestId("tool-output")).toHaveTextContent(
      "Edited a.txt: replaced 1 occurrence (+1 −1 lines)",
    );
  });

  it("shows a List card with the directory and its entries", () => {
    render(
      <ToolCallCard
        tool={tool({ name: "list_directory", args: { path: "src" }, output: "lib.rs\nutil/" })}
      />,
    );
    expect(screen.getByText("List")).toBeInTheDocument();
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "lib.rs",
      "util/",
    ]);
  });

  it("labels the project root when List has no path", () => {
    render(<ToolCallCard tool={tool({ name: "list_directory", args: {}, output: "a" })} />);
    expect(screen.getByText(".")).toBeInTheDocument();
  });

  it("shows a running state before the result arrives", () => {
    render(<ToolCallCard tool={tool({ status: "running", output: null })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/running/i);
    expect(screen.queryByTestId("tool-output")).not.toBeInTheDocument();
  });

  it("shows a failed tool's error message", () => {
    render(<ToolCallCard tool={tool({ status: "error", output: "cannot read a.txt" })} />);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
    expect(screen.getByTestId("tool-output")).toHaveTextContent("cannot read a.txt");
  });

  it("falls back to the tool name and raw output for other tools", () => {
    render(<ToolCallCard tool={tool({ name: "mystery", args: { q: 1 }, output: "raw" })} />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
    expect(screen.getByTestId("tool-output")).toHaveTextContent("raw");
  });

  describe("shell commands", () => {
    const shell = (overrides: Partial<ToolItem>) =>
      tool({
        name: "run_shell",
        args: { command: "ls -la" },
        output: null,
        status: "running",
        lines: [],
        exitCode: null,
        ...overrides,
      });

    it("shows the command and streams its lines while it runs", () => {
      render(
        <ToolCallCard
          tool={shell({
            lines: [
              { stream: "stdout", text: "total 8" },
              { stream: "stderr", text: "warning: slow disk" },
            ],
          })}
        />,
      );
      expect(screen.getByRole("article", { name: /shell tool call/i })).toBeInTheDocument();
      expect(screen.getByText("ls -la")).toBeInTheDocument();
      const output = screen.getByTestId("shell-output");
      expect(output).toHaveTextContent("total 8");
      expect(screen.getByText("warning: slow disk")).toHaveAttribute("data-stream", "stderr");
      expect(screen.getByRole("status")).toHaveTextContent(/running/i);
    });

    it("says how many earlier lines are hidden", () => {
      render(
        <ToolCallCard
          tool={shell({ lines: [{ stream: "stdout", text: "tail" }], hiddenLines: 1500 })}
        />,
      );
      expect(screen.getByText("… 1500 earlier lines not shown")).toBeInTheDocument();
    });

    it("shows the exit code when the command finishes", () => {
      render(
        <ToolCallCard
          tool={shell({
            status: "done",
            output: "hello\nExit code: 0",
            lines: [{ stream: "stdout", text: "hello" }],
            exitCode: 0,
          })}
        />,
      );
      expect(screen.getByText("Exit code 0")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByTestId("shell-output")).toHaveTextContent("hello");
    });

    it("marks a non-zero exit code", () => {
      render(
        <ToolCallCard tool={shell({ status: "done", output: "Exit code: 2", exitCode: 2 })} />,
      );
      expect(screen.getByText("Exit code 2")).toHaveClass("text-destructive");
      expect(screen.getByText(/no output/i)).toBeInTheDocument();
    });

    it("shows why a command could not run", () => {
      render(
        <ToolCallCard
          tool={shell({ status: "error", output: "missing string argument: command" })}
        />,
      );
      expect(screen.getByText("Failed")).toBeInTheDocument();
      expect(screen.getByText(/missing string argument/)).toBeInTheDocument();
    });
  });

  describe("approval cards", () => {
    const pending = (overrides: Partial<ToolItem>) =>
      tool({ status: "running", output: null, ...overrides });

    it("shows the exact command with Approve, Deny and Always allow", async () => {
      const onAnswer = vi.fn();
      render(
        <ToolCallCard
          tool={pending({
            name: "run_shell",
            args: { command: "npm test" },
            approval: {
              kind: "command",
              command: "npm test",
              path: null,
              diff: null,
              status: "pending",
            },
          })}
          onAnswer={onAnswer}
        />,
      );
      const card = screen.getByRole("region", { name: /approval needed/i });
      expect(card).toHaveTextContent("npm test");
      await userEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect(onAnswer).toHaveBeenCalledWith("t1", "approve");
      await userEvent.click(screen.getByRole("button", { name: "Deny" }));
      expect(onAnswer).toHaveBeenCalledWith("t1", "deny");
      await userEvent.click(screen.getByRole("button", { name: /always allow/i }));
      expect(onAnswer).toHaveBeenCalledWith("t1", "always_allow");
    });

    it("shows the diff an edit would make", () => {
      render(
        <ToolCallCard
          tool={pending({
            name: "edit_file",
            approval: {
              kind: "edit",
              command: null,
              path: "src/main.rs",
              diff: "@@ -1 +1 @@\n-old\n+new\n",
              status: "pending",
            },
          })}
          onAnswer={vi.fn()}
        />,
      );
      const card = screen.getByRole("region", { name: /approval needed/i });
      expect(card).toHaveTextContent("src/main.rs");
      expect(card).toHaveTextContent("+new");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows the answer once the card is resolved", () => {
      render(
        <ToolCallCard
          tool={pending({
            name: "run_shell",
            approval: {
              kind: "command",
              command: "ls",
              path: null,
              diff: null,
              status: "always_allow",
            },
          })}
          onAnswer={vi.fn()}
        />,
      );
      expect(screen.queryByRole("region", { name: /approval needed/i })).not.toBeInTheDocument();
      expect(screen.getByText(/always allowed/i)).toBeInTheDocument();
    });
  });

  describe("questions", () => {
    const questions = [
      {
        id: "color",
        question: "Which color do you prefer?",
        header: "Pick one",
        options: [
          { label: "Blue", description: "Calm in long sessions." },
          { label: "Green", description: null },
        ],
        multi_select: true,
      },
      {
        id: "size",
        question: "Which size?",
        header: null,
        options: [
          { label: "Small", description: null },
          { label: "Large", description: null },
        ],
        multi_select: false,
      },
    ];
    const asked = (
      status: "pending" | "answered" | "cancelled",
      answers: QuestionAnswer[] | null = null,
    ) =>
      tool({
        name: "ask_user_question",
        args: { questions },
        status: status === "pending" ? "running" : status === "answered" ? "done" : "error",
        output: null,
        question: { questions, answers, status },
      });

    it("asks each question with its options and sends the picked answers", async () => {
      const onAnswerQuestion = vi.fn();
      render(<ToolCallCard tool={asked("pending")} onAnswerQuestion={onAnswerQuestion} />);
      expect(screen.getByText("Question")).toBeInTheDocument();
      const color = screen.getByRole("group", { name: /Pick one Which color do you prefer\?/ });
      expect(color).toHaveTextContent("Calm in long sessions.");
      await userEvent.click(screen.getByRole("checkbox", { name: /Blue/ }));
      await userEvent.click(screen.getByRole("checkbox", { name: /Green/ }));
      await userEvent.click(screen.getByRole("radio", { name: "Small" }));
      await userEvent.click(screen.getByRole("radio", { name: "Large" }));
      await userEvent.type(
        screen.getAllByRole("textbox", { name: "Other answer" })[0],
        "Include accessibility notes",
      );
      await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
      expect(onAnswerQuestion).toHaveBeenCalledWith("t1", [
        { id: "color", selected: ["Blue", "Green"], custom: "Include accessibility notes" },
        { id: "size", selected: ["Large"] },
      ]);
    });

    it("skips every question with empty answers", async () => {
      const onAnswerQuestion = vi.fn();
      render(<ToolCallCard tool={asked("pending")} onAnswerQuestion={onAnswerQuestion} />);
      await userEvent.click(screen.getByRole("button", { name: "Skip" }));
      expect(onAnswerQuestion).toHaveBeenCalledWith("t1", [
        { id: "color", selected: [] },
        { id: "size", selected: [] },
      ]);
    });

    it("shows the questions and answers once answered", () => {
      render(
        <ToolCallCard
          tool={asked("answered", [
            { id: "color", selected: ["Blue"], custom: "Include accessibility notes" },
            { id: "size", selected: [] },
          ])}
        />,
      );
      const qa = screen.getByRole("group", { name: "Questions and answers" });
      expect(qa).toHaveTextContent("Pick one Which color do you prefer?");
      expect(qa).toHaveTextContent("Blue, Include accessibility notes");
      expect(qa).toHaveTextContent("Skipped");
      expect(screen.queryByRole("button", { name: "Submit answers" })).not.toBeInTheDocument();
    });

    it("says when the question set was cancelled", () => {
      render(<ToolCallCard tool={asked("cancelled")} />);
      expect(
        screen.getByText("This question set was cancelled before answers were submitted."),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      expect(screen.getByText("Which color do you prefer?")).toBeInTheDocument();
      expect(screen.queryByText("Failed")).not.toBeInTheDocument();
    });
  });

  describe("plans", () => {
    it("lists the plan a todo_write call wrote, with each status", () => {
      render(
        <ToolCallCard
          tool={tool({
            name: "todo_write",
            args: {},
            output: "Updated todo list: 1 pending, 1 in progress, 1 completed.",
            todos: [
              { content: "Read the code", status: "completed" },
              { content: "Fix the bug", status: "in_progress" },
              { content: "Run the tests", status: "pending" },
            ],
          })}
        />,
      );
      expect(screen.getByText("Todo")).toBeInTheDocument();
      const items = screen.getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual([
        "Completed: Read the code",
        "In progress: Fix the bug",
        "Pending: Run the tests",
      ]);
      expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    });
  });
});
