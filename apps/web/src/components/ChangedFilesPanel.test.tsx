import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FileChange } from "@/session/session-reducer";
import ChangedFilesPanel from "./ChangedFilesPanel";

const files: FileChange[] = [
  {
    path: "src/a.ts",
    diff: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n",
    additions: 1,
    deletions: 1,
  },
  {
    path: "new.md",
    diff: "--- /dev/null\n+++ b/new.md\n@@ -0,0 +1 @@\n+hi\n",
    additions: 1,
    deletions: 0,
  },
];

describe("ChangedFilesPanel", () => {
  it("shows an empty state before any edit", () => {
    render(<ChangedFilesPanel files={[]} />);
    expect(screen.getByText(/no changes yet/i)).toBeInTheDocument();
  });

  it("lists every changed file with its line counts", () => {
    render(<ChangedFilesPanel files={files} />);
    const items = screen.getAllByRole("button", { name: /src\/a\.ts|new\.md/ });
    expect(items.map((b) => b.textContent)).toEqual(["src/a.ts+1−1", "new.md+1−0"]);
    expect(screen.getByRole("heading", { name: /changed files \(2\)/i })).toBeInTheDocument();
  });

  it("shows a file's diff when it is clicked", async () => {
    render(<ChangedFilesPanel files={files} />);
    expect(screen.queryByTestId("diff-line")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /new\.md/ }));
    expect(screen.getByRole("button", { name: /new\.md/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("diff-line").map((l) => l.textContent)).toContain("+hi");
  });

  it("updates the open diff live when the file changes again", async () => {
    const { rerender } = render(<ChangedFilesPanel files={files} />);
    await userEvent.click(screen.getByRole("button", { name: /src\/a\.ts/ }));
    rerender(
      <ChangedFilesPanel
        files={[{ ...files[0], diff: "@@ -1 +1,2 @@\n-x\n+y\n+z\n", additions: 2 }, files[1]]}
      />,
    );
    expect(screen.getAllByTestId("diff-line").map((l) => l.textContent)).toContain("+z");
    expect(screen.getByRole("button", { name: /src\/a\.ts/ })).toHaveTextContent("+2");
  });

  it("closes the diff when its file leaves the list", async () => {
    const { rerender } = render(<ChangedFilesPanel files={files} />);
    await userEvent.click(screen.getByRole("button", { name: /new\.md/ }));
    rerender(<ChangedFilesPanel files={[files[0]]} />);
    expect(screen.queryByTestId("diff-line")).not.toBeInTheDocument();
  });

  it("asks for confirmation before reverting all changes", async () => {
    const onRevertAll = vi.fn();
    render(<ChangedFilesPanel files={files} onRevertAll={onRevertAll} />);

    await userEvent.click(screen.getByRole("button", { name: "Revert all" }));
    expect(onRevertAll).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Revert all" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm revert/i }));
    expect(onRevertAll).toHaveBeenCalledOnce();
  });

  it("disables reverting while the agent is working", () => {
    render(<ChangedFilesPanel files={files} onRevertAll={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: "Revert all" })).toBeDisabled();
  });

  it("offers no revert when nothing changed", () => {
    render(<ChangedFilesPanel files={[]} onRevertAll={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Revert all" })).not.toBeInTheDocument();
  });
});
