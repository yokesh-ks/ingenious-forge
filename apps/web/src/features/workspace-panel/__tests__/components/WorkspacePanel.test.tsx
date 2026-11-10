import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileChange } from "@/features/session/session-reducer";
import { fakeFetch } from "@/test/fake-fetch";
import WorkspacePanel from "../../components/WorkspacePanel";

// xterm needs a real canvas; its mount and lifetime are what matter here.
const NO_LOG = { events: [], hasOlder: false, loadingOlder: false, onLoadOlder: () => {} };
const terminalMounts = vi.fn();
const terminalUnmounts = vi.fn();
vi.mock("@/features/terminal/components/TerminalPanel", async () => {
  const { useEffect } = await import("react");
  return {
    default: () => {
      useEffect(() => {
        terminalMounts();
        return () => terminalUnmounts();
      }, []);
      return <div>terminal body</div>;
    },
  };
});

const file: FileChange = {
  path: "a.txt",
  diff: "@@ -1 +1 @@\n-a\n+b\n",
  additions: 1,
  deletions: 1,
};

function setup(files: FileChange[] = []) {
  const onRevertAll = vi.fn();
  render(
    <WorkspacePanel
      projectId="p1"
      sessionId="s1"
      log={NO_LOG}
      changedFiles={files}
      onRevertAll={onRevertAll}
      busy={false}
    />,
  );
  return { onRevertAll };
}

const expand = () =>
  Promise.resolve(fireEvent.keyDown(window, { code: "KeyB", metaKey: true, shiftKey: true }));
const panel = () => screen.getByLabelText("Workspace panel");
const card = (name: RegExp) => within(panel()).getByRole("button", { name });
const tabs = () =>
  within(panel())
    .getAllByRole("tab")
    .map((t) => t.textContent);

beforeEach(() => {
  localStorage.clear();
  terminalMounts.mockClear();
  terminalUnmounts.mockClear();
  Element.prototype.setPointerCapture = vi.fn();
  fakeFetch({
    "GET /api/projects/p1/directory": {
      entries: [{ name: "README.md", kind: "file" }],
      truncated: false,
    },
  });
});

describe("WorkspacePanel", () => {
  it("starts collapsed, and opens on the Start page", async () => {
    setup();
    expect(panel()).not.toBeVisible();
    await expand();
    expect(panel()).toBeVisible();
    expect(tabs()).toEqual(["Start"]);
    expect(card(/^Workspace files/)).toHaveTextContent("Browse files in this session's workspace");
    expect(card(/^Code review and changes/)).toBeInTheDocument();
    expect(within(panel()).getByText("Run commands in the Session workspace")).toBeVisible();
    expect(card(/^Session log/)).toBeEnabled();
  });

  it("opens a card in Start's place and brings Start back with New tab", async () => {
    setup([file]);
    await expand();
    await userEvent.click(card(/^Code review and changes/));
    expect(tabs()).toEqual(["Changes"]);
    expect(screen.getByText("Changed files (1)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New tab" }));
    expect(tabs()).toEqual(["Changes", "Start"]);
    expect(screen.queryByRole("button", { name: "New tab" })).not.toBeInTheDocument();
  });

  it("closes tabs; closing the last one closes the panel, which reopens on Start", async () => {
    setup();
    await expand();
    expect(screen.queryByRole("button", { name: "Close Start" })).not.toBeInTheDocument();
    await userEvent.click(card(/^Workspace files/));
    expect(await screen.findByRole("button", { name: "README.md" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close Files" }));
    expect(panel()).not.toBeVisible();
    await expand();
    expect(tabs()).toEqual(["Start"]);
  });

  it("reverts all changes from the Changes tab", async () => {
    const { onRevertAll } = setup([file]);
    await expand();
    await userEvent.click(card(/^Code review and changes/));
    await userEvent.click(screen.getByRole("button", { name: "Revert all" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm revert/i }));
    expect(onRevertAll).toHaveBeenCalled();
  });

  it("keeps terminals alive across tab switches and collapsing", async () => {
    setup();
    await expand();
    await userEvent.click(card(/^New terminal/));
    await userEvent.click(screen.getByRole("button", { name: "New tab" }));
    await userEvent.click(card(/^Workspace files/));
    fireEvent.keyDown(window, { code: "KeyB", metaKey: true, shiftKey: true });
    await expand();
    expect(terminalMounts).toHaveBeenCalledTimes(1);
    expect(terminalUnmounts).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Terminal" }));
    expect(screen.getByText("terminal body")).toBeVisible();
  });

  it("ends a terminal's shell when its tab closes", async () => {
    const fetch = fakeFetch({
      "DELETE /api/projects/p1/terminal": () => ({ status: 204, body: undefined }),
    });
    setup();
    await expand();
    await userEvent.click(card(/^New terminal/));
    await userEvent.click(screen.getByRole("button", { name: "Close Terminal" }));
    expect(panel()).not.toBeVisible();
    const closed = fetch.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(String(closed?.[0])).toMatch(/\/api\/projects\/p1\/terminal\?tab=s1-terminal-\d+$/);
  });

  it("goes fullscreen and back", async () => {
    setup();
    await expand();
    await userEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(panel()).toHaveClass("fixed");
    await userEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(panel()).not.toHaveClass("fixed");
  });

  it("opens from its keyboard shortcuts", async () => {
    setup();
    fireEvent.keyDown(window, { code: "KeyB", metaKey: true, shiftKey: true });
    expect(panel()).toBeVisible();
    fireEvent.keyDown(window, { code: "KeyB", metaKey: true, shiftKey: true });
    expect(panel()).not.toBeVisible();
    fireEvent.keyDown(window, { code: "KeyP", metaKey: true, altKey: true });
    expect(panel()).toBeVisible();
    expect(tabs()).toEqual(["Files"]);
    fireEvent.keyDown(window, { code: "Backquote", ctrlKey: true });
    expect(tabs()).toEqual(["Files", "Terminal"]);
  });

  it("resizes from its edge and resets on double-click", async () => {
    setup();
    await expand();
    const initial = panel().style.width;
    expect(initial).not.toBe("");
    const handle = screen.getByRole("separator", { name: "Resize workspace panel" });
    handle.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(panel().style.width).not.toBe(initial);
    await userEvent.dblClick(handle);
    expect(panel().style.width).toBe(initial);
  });
});
