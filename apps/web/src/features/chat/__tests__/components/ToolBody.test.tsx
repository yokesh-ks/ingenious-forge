import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuestionAnswer } from "@/api/types";
import type { ToolItem } from "@/features/session/session-reducer";
import ToolBody from "../../components/ToolBody";

function tool(overrides: Partial<ToolItem>): ToolItem {
  return {
    id: "m1",
    role: "tool",
    callId: "t1",
    name: "read",
    args: { file_path: "src/main.rs" },
    status: "done",
    output: "fn main() {}",
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

/** A read of `count` lines, with its result details. */
function read(count: number, path = "/p/README.md"): ToolItem {
  const lines = Array.from({ length: count }, (_, i) => ({ number: i + 1, text: `line ${i + 1}` }));
  return tool({
    args: { file_path: path },
    output: "<path>…</path>",
    meta: { path, offset: 1, lines, total_lines: count },
  });
}

const shown = () => screen.getAllByTestId("read-line").map((l) => l.textContent);

describe("ToolBody", () => {
  describe("read card", () => {
    it("shows the language, the file name and every line up to eight", () => {
      render(<ToolBody tool={read(8)} />);
      const card = screen.getByRole("figure", { name: "README.md" });
      expect(card).toHaveTextContent("md");
      expect(shown()).toHaveLength(8);
      expect(shown()[0]).toBe("1line 1");
      expect(screen.queryByRole("button", { name: /more lines/ })).not.toBeInTheDocument();
    });

    it("shows the first and last four of nine lines or more, and expands in place", async () => {
      render(<ToolBody tool={read(9)} />);
      expect(shown().map((l) => l.replace(/^\d+/, ""))).toEqual([
        "line 1",
        "line 2",
        "line 3",
        "line 4",
        "line 6",
        "line 7",
        "line 8",
        "line 9",
      ]);
      await userEvent.click(screen.getByRole("button", { name: "Expand 1 more lines" }));
      expect(shown()).toHaveLength(9);
    });

    it("says how many lines a long file hides", () => {
      render(<ToolBody tool={read(55)} />);
      expect(screen.getByRole("button", { name: "Expand 47 more lines" })).toHaveTextContent(
        "… 47 more lines",
      );
      expect(shown()[shown().length - 1]).toBe("55line 55");
    });

    it("wraps long lines on request and copies the file's text", async () => {
      const writeText = vi.fn(async () => {});
      Object.assign(navigator, { clipboard: { writeText } });
      render(<ToolBody tool={read(2)} />);
      const wrap = screen.getByRole("button", { name: "Wrap lines" });
      expect(wrap).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(wrap);
      expect(wrap).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(screen.getByRole("button", { name: "Copy" }));
      expect(writeText).toHaveBeenCalledWith("line 1\nline 2");
    });

    it("reads the lines from the result text in older sessions", () => {
      render(
        <ToolBody tool={tool({ name: "read_file", args: { path: "a.rs" }, output: "x\ny" })} />,
      );
      expect(shown()).toEqual(["1x", "2y"]);
    });
  });

  describe("bash card", () => {
    const shell = (overrides: Partial<ToolItem>) =>
      tool({
        name: "bash",
        args: { command: "ls -la", description: "List files" },
        output: null,
        status: "running",
        ...overrides,
      });

    it("shows the folder, the command and its streamed lines while it runs", () => {
      render(
        <ToolBody
          tool={shell({
            lines: [
              { stream: "stdout", text: "total 8" },
              { stream: "stderr", text: "warning: slow disk" },
            ],
          })}
        />,
      );
      expect(screen.getByTestId("shell-command")).toHaveTextContent("ls -la");
      expect(screen.getByTestId("run-state")).toHaveTextContent("Running");
      expect(screen.getByTestId("shell-output")).toHaveTextContent("total 8");
      expect(screen.getByText("warning: slow disk")).toHaveAttribute("data-stream", "stderr");
    });

    it("shows the folder it ran in and copies the command", async () => {
      const writeText = vi.fn(async () => {});
      Object.assign(navigator, { clipboard: { writeText } });
      render(
        <ToolBody
          tool={shell({
            status: "done",
            output: "a",
            lines: [{ stream: "stdout", text: "a" }],
            exitCode: 0,
            meta: { cwd: "/Users/me/ingenious-forge", exit_code: 0, duration_ms: 5 },
          })}
        />,
      );
      expect(screen.getByText("ingenious-forge")).toBeInTheDocument();
      expect(screen.getByTestId("run-state")).toHaveTextContent("Done");
      expect(screen.queryByText(/Exit code/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Copy" }));
      expect(writeText).toHaveBeenCalledWith("ls -la");
      expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    });

    it("marks a non-zero exit and says when there was no output", () => {
      render(<ToolBody tool={shell({ status: "done", output: "Exit code: 2", exitCode: 2 })} />);
      expect(screen.getByTestId("run-state")).toHaveTextContent("Failed");
      expect(screen.getByText("Exit code 2")).toHaveClass("text-destructive");
      expect(screen.getByText(/no output/i)).toBeInTheDocument();
    });

    it("says how many earlier lines are hidden", () => {
      render(
        <ToolBody
          tool={shell({ lines: [{ stream: "stdout", text: "tail" }], hiddenLines: 1500 })}
        />,
      );
      expect(screen.getByText("… 1500 earlier lines not shown")).toBeInTheDocument();
    });

    it("shows why a command could not run", () => {
      render(<ToolBody tool={shell({ status: "error", output: "missing string argument" })} />);
      expect(screen.getByTestId("run-state")).toHaveTextContent("Failed");
      expect(screen.getByText(/missing string argument/)).toBeInTheDocument();
    });
  });

  describe("edit and write cards", () => {
    it("shows the call's own diff under the file name", () => {
      render(
        <ToolBody
          tool={tool({
            name: "edit",
            args: { file_path: "src/a.txt", old_string: "two", new_string: "2" },
            output: "Edited a.txt (+1 −1 lines)",
            meta: {
              path: "/p/src/a.txt",
              created: false,
              additions: 1,
              deletions: 1,
              diff: "@@ -1 +1 @@\n-two\n+2\n",
            },
          })}
        />,
      );
      const card = screen.getByRole("figure", { name: "a.txt" });
      expect(card).toHaveTextContent("+1");
      expect(card).toHaveTextContent("−1");
      expect(screen.getAllByTestId("diff-line").map((l) => l.dataset.kind)).toEqual([
        "hunk",
        "removed",
        "added",
      ]);
    });

    it("shows the summary when an older session has no diff", () => {
      render(
        <ToolBody
          tool={tool({
            name: "edit_file",
            args: { path: "a.txt" },
            output: "Edited a.txt: replaced 1 occurrence (+1 −1 lines)",
          })}
        />,
      );
      expect(screen.getByTestId("tool-output")).toHaveTextContent("replaced 1 occurrence");
    });
  });

  it("shows other tools' output as text", () => {
    render(
      <ToolBody tool={tool({ name: "grep", args: { pattern: "x" }, output: "a.ts\n1: x" })} />,
    );
    expect(screen.getByTestId("tool-output")).toHaveTextContent("a.ts 1: x");
  });

  it("shows a running state before the result arrives", () => {
    render(<ToolBody tool={tool({ name: "grep", status: "running", output: null })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/running/i);
  });

  it("shows a failed tool's error message", () => {
    render(<ToolBody tool={tool({ status: "error", output: "cannot read a.txt" })} />);
    expect(screen.getByTestId("tool-output")).toHaveTextContent("cannot read a.txt");
    expect(screen.getByTestId("tool-output")).toHaveClass("text-destructive");
  });

  it("offers Inspect, not yet available", () => {
    render(<ToolBody tool={read(2)} />);
    expect(screen.getByRole("button", { name: "Inspect" })).toBeDisabled();
  });

  describe("approval cards", () => {
    const pending = (overrides: Partial<ToolItem>) =>
      tool({ status: "running", output: null, ...overrides });

    it("shows the exact command with Approve, Deny and Always allow", async () => {
      const onAnswerApproval = vi.fn();
      render(
        <ToolBody
          tool={pending({
            name: "bash",
            args: { command: "npm test" },
            approval: {
              kind: "command",
              command: "npm test",
              path: null,
              diff: null,
              status: "pending",
            },
          })}
          onAnswerApproval={onAnswerApproval}
        />,
      );
      expect(screen.getByRole("region", { name: /approval needed/i })).toHaveTextContent(
        "npm test",
      );
      // Nothing ran yet, so there is no card for the command.
      expect(screen.queryByTestId("run-state")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect(onAnswerApproval).toHaveBeenCalledWith("t1", "approve");
      await userEvent.click(screen.getByRole("button", { name: "Deny" }));
      expect(onAnswerApproval).toHaveBeenCalledWith("t1", "deny");
      await userEvent.click(screen.getByRole("button", { name: /always allow/i }));
      expect(onAnswerApproval).toHaveBeenCalledWith("t1", "always_allow");
    });

    it("shows the diff an edit would make", () => {
      render(
        <ToolBody
          tool={pending({
            name: "edit",
            approval: {
              kind: "edit",
              command: null,
              path: "src/main.rs",
              diff: "@@ -1 +1 @@\n-old\n+new\n",
              status: "pending",
            },
          })}
          onAnswerApproval={vi.fn()}
        />,
      );
      const card = screen.getByRole("region", { name: /approval needed/i });
      expect(card).toHaveTextContent("src/main.rs");
      expect(card).toHaveTextContent("+new");
    });

    it("shows the answer once the card is resolved", () => {
      render(
        <ToolBody
          tool={pending({
            name: "bash",
            approval: {
              kind: "command",
              command: "ls",
              path: null,
              diff: null,
              status: "always_allow",
            },
          })}
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
      render(<ToolBody tool={asked("pending")} onAnswerQuestion={onAnswerQuestion} />);
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
      render(<ToolBody tool={asked("pending")} onAnswerQuestion={onAnswerQuestion} />);
      await userEvent.click(screen.getByRole("button", { name: "Skip" }));
      expect(onAnswerQuestion).toHaveBeenCalledWith("t1", [
        { id: "color", selected: [] },
        { id: "size", selected: [] },
      ]);
    });

    it("shows the questions and answers once answered", () => {
      render(
        <ToolBody
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
      render(<ToolBody tool={asked("cancelled")} />);
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
        <ToolBody
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
