import { describe, expect, it } from "vitest";
import {
  activateTab,
  canCloseTab,
  canSplit,
  closePaneTab,
  dropToSplit,
  initialLayout,
  moveTab,
  openFileTab,
  openPage,
  type PanelLayout,
  renameTab,
  resolveShells,
  setRatio,
  split,
} from "../../model/panes";

const shape = (layout: PanelLayout) =>
  layout.panes.map((pane) => pane.tabs.tabs.map((t) => t.path ?? t.kind));
const paneIds = (layout: PanelLayout) => layout.panes.map((p) => p.id);
const allIds = (layout: PanelLayout) => layout.panes.flatMap((p) => p.tabs.tabs.map((t) => t.id));

/** Two panes: a.ts and b.ts on the left, Start on the right. */
function twoPanes() {
  let layout = openFileTab(initialLayout(), "a.ts");
  layout = openFileTab(layout, "b.ts");
  return split(layout, layout.panes[0].id);
}

describe("split", () => {
  it("adds an evenly sized pane on Start and moves there", () => {
    const layout = twoPanes();
    expect(shape(layout)).toEqual([["a.ts", "b.ts"], ["start"]]);
    expect(layout.activePane).toBe(layout.panes[1].id);
    expect(layout.ratio).toBe(0.5);
    expect(new Set(layout.panes.map((p) => p.slot)).size).toBe(2);
  });

  it("stops at two panes", () => {
    const layout = twoPanes();
    expect(canSplit(layout)).toBe(false);
    expect(split(layout, layout.panes[0].id)).toBe(layout);
  });

  it("keeps ids unique across panes", () => {
    let layout = twoPanes();
    layout = openFileTab(layout, "c.ts");
    layout = openPage(layout, "terminal");
    expect(new Set(allIds(layout)).size).toBe(allIds(layout).length);
  });
});

describe("the divider", () => {
  it("leaves each pane at least a fifth", () => {
    const layout = twoPanes();
    expect(setRatio(layout, 0.05).ratio).toBe(0.2);
    expect(setRatio(layout, 0.95).ratio).toBe(0.8);
    expect(setRatio(layout, 0.6).ratio).toBe(0.6);
  });
});

describe("closing", () => {
  it("takes away a pane left with nothing", () => {
    const layout = twoPanes();
    const start = layout.panes[1];
    const closed = closePaneTab(layout, start.id, start.tabs.tabs[0].id);
    expect(shape(closed)).toEqual([["a.ts", "b.ts"]]);
    expect(closed.activePane).toBe(closed.panes[0].id);
  });

  it("returns to Start when the only pane empties", () => {
    const layout = openFileTab(initialLayout(), "a.ts");
    const pane = layout.panes[0];
    expect(shape(closePaneTab(layout, pane.id, pane.tabs.tabs[0].id))).toEqual([["start"]]);
  });

  it("lets a lone Start close only while another pane remains", () => {
    const one = initialLayout();
    expect(canCloseTab(one, one.panes[0], one.panes[0].tabs.tabs[0])).toBe(false);
    const two = twoPanes();
    expect(canCloseTab(two, two.panes[1], two.panes[1].tabs.tabs[0])).toBe(true);
  });
});

describe("files across panes", () => {
  it("selects a file already open in the other pane", () => {
    const layout = twoPanes();
    const opened = openFileTab(layout, "a.ts");
    expect(shape(opened)).toEqual([["a.ts", "b.ts"], ["start"]]);
    expect(opened.activePane).toBe(opened.panes[0].id);
    expect(opened.panes[0].tabs.active).toBe(opened.panes[0].tabs.tabs[0].id);
  });

  it("opens a new file in the active pane", () => {
    expect(shape(openFileTab(twoPanes(), "c.ts"))).toEqual([["a.ts", "b.ts"], ["c.ts"]]);
  });
});

describe("moveTab", () => {
  it("reorders within a pane, counting slots with the tab in place", () => {
    const layout = twoPanes();
    const [a] = layout.panes[0].tabs.tabs;
    expect(shape(moveTab(layout, a.id, layout.panes[0].id, 2))[0]).toEqual(["b.ts", "a.ts"]);
    expect(moveTab(layout, a.id, layout.panes[0].id, 1)).toBe(layout);
  });

  it("moves to the other pane and selects it there", () => {
    const layout = twoPanes();
    const [a] = layout.panes[0].tabs.tabs;
    const moved = moveTab(layout, a.id, layout.panes[1].id);
    expect(shape(moved)).toEqual([["b.ts"], ["start", "a.ts"]]);
    expect(moved.panes[1].tabs.active).toBe(a.id);
    expect(moved.activePane).toBe(moved.panes[1].id);
  });

  it("selects a neighbour in the pane the active tab left", () => {
    let layout = twoPanes();
    const [a, b] = layout.panes[0].tabs.tabs;
    layout = activateTab(layout, layout.panes[0].id, a.id);
    const moved = moveTab(layout, a.id, layout.panes[1].id);
    expect(moved.panes[0].tabs.active).toBe(b.id);
  });

  it("collapses the pane a last tab leaves", () => {
    let layout = openFileTab(initialLayout(), "a.ts");
    layout = split(layout, layout.panes[0].id);
    const a = layout.panes[0].tabs.tabs[0];
    const moved = moveTab(layout, a.id, layout.panes[1].id);
    expect(shape(moved)).toEqual([["start", "a.ts"]]);
    expect(paneIds(moved)).toEqual([layout.panes[1].id]);
  });

  it("merges a Start into a pane that has one", () => {
    let layout = split(initialLayout(), "pane-0");
    const start = layout.panes[0].tabs.tabs[0];
    layout = moveTab(layout, start.id, layout.panes[1].id);
    expect(shape(layout)).toEqual([["start"]]);
  });
});

describe("dropToSplit", () => {
  it("puts the tab in a new pane on the chosen side", () => {
    const layout = openFileTab(openFileTab(initialLayout(), "a.ts"), "b.ts");
    const [a] = layout.panes[0].tabs.tabs;
    expect(shape(dropToSplit(layout, a.id, "right"))).toEqual([["b.ts"], ["a.ts"]]);
    expect(shape(dropToSplit(layout, a.id, "left"))).toEqual([["a.ts"], ["b.ts"]]);
  });

  it("leaves Start behind when the pane's only tab moves", () => {
    const layout = openFileTab(initialLayout(), "a.ts");
    const moved = dropToSplit(layout, layout.panes[0].tabs.tabs[0].id, "right");
    expect(shape(moved)).toEqual([["start"], ["a.ts"]]);
    expect(moved.panes[1].tabs.active).toBe(moved.panes[1].tabs.tabs[0].id);
    expect(new Set(allIds(moved)).size).toBe(2);
  });

  it("does nothing at two panes", () => {
    const layout = twoPanes();
    expect(dropToSplit(layout, layout.panes[0].tabs.tabs[0].id, "left")).toBe(layout);
  });
});

describe("terminals", () => {
  it("opens with a chosen shell or waits for one", () => {
    const chosen = openPage(initialLayout(), "terminal", {
      shell: { name: "bash", path: "/bin/bash" },
    });
    expect(chosen.panes[0].tabs.tabs[0].shell?.name).toBe("bash");

    const waiting = openPage(initialLayout(), "terminal");
    expect(waiting.panes[0].tabs.tabs[0].shell).toBeUndefined();
    const known = resolveShells(waiting, { name: "zsh", path: "/bin/zsh" });
    expect(known.panes[0].tabs.tabs[0].shell?.name).toBe("zsh");
    expect(resolveShells(known, null).panes[0].tabs.tabs[0].shell?.name).toBe("zsh");
  });

  it("can be renamed", () => {
    const layout = openPage(initialLayout(), "terminal");
    const tab = layout.panes[0].tabs.tabs[0];
    expect(renameTab(layout, tab.id, "dev").panes[0].tabs.tabs[0].title).toBe("dev");
  });
});
