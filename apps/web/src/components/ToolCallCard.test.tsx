import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ToolItem } from "@/session/session-reducer";
import ToolCallCard from "./ToolCallCard";

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
    exitCode: null,
    ...overrides,
  };
}

describe("ToolCallCard", () => {
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
});
