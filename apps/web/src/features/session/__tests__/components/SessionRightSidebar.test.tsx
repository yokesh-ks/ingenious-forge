import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FileChange } from "@/features/session/session-reducer";
import { fakeFetch } from "@/test/fake-fetch";
import SessionRightSidebar from "../../components/SessionRightSidebar";

function renderSidebar(files: FileChange[] = []) {
  const onRevertAll = vi.fn();
  render(
    <SessionRightSidebar
      projectId="p1"
      changedFiles={files}
      onRevertAll={onRevertAll}
      busy={false}
    />,
  );
  return { onRevertAll };
}

describe("SessionRightSidebar", () => {
  it("shows the changed files tab by default", () => {
    const file: FileChange = {
      path: "a.txt",
      diff: "@@ -1 +1 @@\n-a\n+b\n",
      additions: 1,
      deletions: 1,
    };
    renderSidebar([file]);
    expect(screen.getByRole("tab", { name: /changes/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Changed files (1)")).toBeInTheDocument();
  });

  it("switches to the project's files without leaving the panel", async () => {
    fakeFetch({ "GET /api/projects/p1/files": { files: ["README.md"], truncated: false } });
    renderSidebar();
    await userEvent.click(screen.getByRole("tab", { name: /files/i }));
    expect(await screen.findByRole("button", { name: "README.md" })).toBeInTheDocument();
  });

  it("reverts all changes from the panel", async () => {
    const file: FileChange = {
      path: "a.txt",
      diff: "@@ -1 +1 @@\n-a\n+b\n",
      additions: 1,
      deletions: 1,
    };
    const { onRevertAll } = renderSidebar([file]);
    await userEvent.click(screen.getByRole("button", { name: "Revert all" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm revert/i }));
    expect(onRevertAll).toHaveBeenCalled();
  });

  it("toggles open and closed from its trigger", async () => {
    renderSidebar();
    const trigger = screen.getByRole("button", { name: /toggle workspace panel/i });
    expect(screen.getByRole("tab", { name: /changes/i })).toBeVisible();
    await userEvent.click(trigger);
  });
});
