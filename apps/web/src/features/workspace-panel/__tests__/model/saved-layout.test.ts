import { beforeEach, describe, expect, it } from "vitest";
import { floatTab, initialLayout, openFileTab, split } from "../../model/panes";
import { readPanel, readWidth, writePanel, writeWidth } from "../../model/saved-layout";

const KEY = "forge.workspace-panel.v1.s1";
const rect = { x: 1, y: 2, width: 380, height: 300 };

beforeEach(() => localStorage.clear());

describe("the saved panel", () => {
  it("round-trips panes and floats", () => {
    let layout = openFileTab(openFileTab(initialLayout(), "b.ts"), "a.ts");
    layout = split(layout, layout.panes[0].id);
    layout = floatTab(layout, layout.panes[0].tabs.active, rect);
    writePanel("s1", { open: true, fullscreen: true, layout });
    const back = readPanel("s1");
    expect(back?.open).toBe(true);
    expect(back?.fullscreen).toBe(true);
    expect(back?.layout.floats[0].tab.path).toBe("a.ts");
    expect(back?.layout.panes).toHaveLength(2);
  });

  it("forgets the one-time line and never reuses an id", () => {
    const layout = openFileTab(initialLayout(), "a.ts", { line: 9 });
    writePanel("s1", { open: true, fullscreen: false, layout: { ...layout, next: 1 } });
    const back = readPanel("s1");
    expect(back?.layout.panes[0].tabs.tabs[0].line).toBeUndefined();
    expect(back?.layout.next).toBeGreaterThan(1);
  });

  it("is empty for a session never saved", () => {
    expect(readPanel("nope")).toBeNull();
  });

  it.each([
    ["not JSON", "{"],
    ["the wrong shape", JSON.stringify({ open: 1 })],
    [
      "an active tab that does not exist",
      JSON.stringify({
        open: true,
        fullscreen: false,
        layout: {
          ...initialLayout(),
          panes: [
            {
              id: "pane-0",
              slot: 0,
              tabs: { tabs: [{ id: "a", kind: "start" }], active: "b", next: 2 },
            },
          ],
        },
      }),
    ],
  ])("drops %s", (_name, value) => {
    localStorage.setItem(KEY, value);
    expect(readPanel("s1")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("remembers the width for every session", () => {
    expect(readWidth()).toBeNull();
    writeWidth(512);
    expect(readWidth()).toBe(512);
  });
});
