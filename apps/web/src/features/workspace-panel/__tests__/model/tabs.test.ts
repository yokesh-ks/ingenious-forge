import { describe, expect, it } from "vitest";
import {
  activate,
  addStart,
  canAddStart,
  canClose,
  closeTab,
  initialTabs,
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
