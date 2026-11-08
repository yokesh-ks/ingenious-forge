import { describe, expect, it } from "vitest";
import {
  activate,
  addStart,
  canAddStart,
  canClose,
  closeTab,
  initialTabs,
  openFile,
  openTab,
  titleOf,
} from "../../model/tabs";

const kinds = (s: ReturnType<typeof openTab>) => s.tabs.map((t) => t.kind);

describe("panel tabs", () => {
  it("starts on a Start tab that cannot be closed alone", () => {
    const s = initialTabs();
    expect(kinds(s)).toEqual(["start"]);
    expect(canClose(s, s.tabs[0])).toBe(false);
    expect(canAddStart(s)).toBe(false);
  });

  it("opens a page in the Start tab's place", () => {
    const s = openTab(initialTabs(), "files");
    expect(kinds(s)).toEqual(["files"]);
    expect(s.tabs[0].id).toBe(s.active);
    expect(canAddStart(s)).toBe(true);
  });

  it("brings Start back at the end, and it can then be closed", () => {
    const s = addStart(openTab(initialTabs(), "files"));
    expect(kinds(s)).toEqual(["files", "start"]);
    expect(s.tabs[1].id).toBe(s.active);
    expect(canClose(s, s.tabs[1])).toBe(true);
    expect(canAddStart(s)).toBe(false);
  });

  it("replaces Start where it sits when a page opens from it", () => {
    const s = openTab(addStart(openTab(initialTabs(), "files")), "changes");
    expect(kinds(s)).toEqual(["files", "changes"]);
  });

  it("reveals a page already open, and Start closes itself", () => {
    const opened = addStart(openTab(initialTabs(), "files"));
    const s = openTab(opened, "files");
    expect(kinds(s)).toEqual(["files"]);
    expect(s.active).toBe(s.tabs[0].id);
  });

  it("appends a page opened while another page is showing", () => {
    expect(kinds(openTab(openTab(initialTabs(), "files"), "changes"))).toEqual([
      "files",
      "changes",
    ]);
    const s = openTab(addStart(openTab(initialTabs(), "files")), "changes");
    expect(kinds(openTab(s, "terminal"))).toEqual(["files", "changes", "terminal"]);
  });

  it("opens as many terminals as asked, each with its own title", () => {
    const one = openTab(initialTabs(), "terminal");
    const two = openTab(one, "terminal");
    expect(kinds(two)).toEqual(["terminal", "terminal"]);
    expect(two.tabs.map((t) => titleOf(two, t))).toEqual(["Terminal", "Terminal 2"]);
    expect(new Set(two.tabs.map((t) => t.id)).size).toBe(2);
  });

  it("moves to the next tab when the active one closes, else the one before", () => {
    const three = openTab(openTab(openTab(initialTabs(), "terminal"), "terminal"), "terminal");
    const [a, b, c] = three.tabs;
    expect(closeTab(activate(three, b.id), b.id).active).toBe(c.id);
    expect(closeTab(activate(three, c.id), c.id).active).toBe(b.id);
    expect(closeTab(activate(three, c.id), a.id).active).toBe(c.id);
  });

  it("returns to Start when the last page closes", () => {
    const s = openTab(initialTabs(), "files");
    const next = closeTab(s, s.tabs[0].id);
    expect(kinds(next)).toEqual(["start"]);
    expect(next.active).toBe(next.tabs[0].id);
  });
});

describe("openFile", () => {
  it("takes Start's place", () => {
    const state = openFile(initialTabs(), "a/b.ts");
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ kind: "file", path: "a/b.ts" });
    expect(state.active).toBe(state.tabs[0].id);
  });

  it("is added after other tabs and leaves them open", () => {
    const state = openFile(openTab(initialTabs(), "files"), "a.ts");
    expect(state.tabs.map((t) => t.kind)).toEqual(["files", "file"]);
    expect(state.active).toBe(state.tabs[1].id);
  });

  it("selects the tab a file already has, and asks it to show the line", () => {
    const once = openFile(initialTabs(), "a.ts");
    const other = openFile(once, "b.ts");
    const again = openFile(other, "a.ts", { line: 9 });
    expect(again.tabs).toHaveLength(2);
    expect(again.active).toBe(once.tabs[0].id);
    expect(again.tabs[0].line).toBe(9);
    expect(again.tabs[0].revision).toBe(2);
  });

  it("gives way to a Start tab being shown when the file already has a tab", () => {
    const opened = openFile(initialTabs(), "a.ts");
    const state = openFile(addStart(opened), "a.ts");
    expect(state.tabs.map((t) => t.kind)).toEqual(["file"]);
  });

  it("replaces the active file in place, keeping its tab", () => {
    const first = openFile(initialTabs(), "a.ts");
    const state = openFile(first, "b.ts", { replace: true });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ id: first.tabs[0].id, path: "b.ts" });
  });

  it("does not replace a page that is not a file", () => {
    const state = openFile(openTab(initialTabs(), "files"), "a.ts", { replace: true });
    expect(state.tabs.map((t) => t.kind)).toEqual(["files", "file"]);
  });

  it("is titled by the file's name", () => {
    const state = openFile(initialTabs(), "src/lib/util.ts");
    expect(titleOf(state, state.tabs[0])).toBe("util.ts");
  });
});

describe("terminal titles", () => {
  it("uses the shell's name once known, and a name the user gave above all", () => {
    const state = openTab(initialTabs(), "terminal");
    const tab = state.tabs[0];
    expect(titleOf(state, tab)).toBe("Terminal");
    expect(titleOf(state, { ...tab, shell: { name: "zsh", path: "/bin/zsh" } })).toBe("zsh");
    expect(
      titleOf(state, { ...tab, shell: { name: "zsh", path: "/bin/zsh" }, title: "server" }),
    ).toBe("server");
  });
});
