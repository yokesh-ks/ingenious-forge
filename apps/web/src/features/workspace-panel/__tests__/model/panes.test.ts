import { describe, expect, it } from "vitest";
import { legalRect, resistedRect, resizedRect } from "../../model/float-geometry";
import {
  activateTab,
  canCloseTab,
  canSplit,
  closeFloat,
  closePaneTab,
  dropToSplit,
  floatRectAt,
  floatTab,
  initialLayout,
  isSoleDocked,
  menuTabs,
  moveTab,
  openFileTab,
  openPage,
  type PanelLayout,
  placeFloat,
  raiseFloat,
  renameTab,
  resolveShells,
  setRatio,
  split,
  unfloat,
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

describe("a tab's menu", () => {
  it("lists what it can close", () => {
    let layout = openFileTab(initialLayout(), "a.ts");
    layout = openFileTab(layout, "b.ts");
    layout = openFileTab(layout, "c.ts");
    const pane = layout.panes[0];
    const [a, b, c] = pane.tabs.tabs;
    const menu = menuTabs(layout, pane.id, b.id);
    expect(menu.close).toBe(true);
    expect(menu.others.map((t) => t.id)).toEqual([a.id, c.id]);
    expect(menu.right.map((t) => t.id)).toEqual([c.id]);
  });

  it("cannot close a lone Start", () => {
    const layout = initialLayout();
    const pane = layout.panes[0];
    expect(menuTabs(layout, pane.id, pane.tabs.active)).toEqual({
      close: false,
      others: [],
      right: [],
    });
  });

  it("knows the panel's only tab", () => {
    const layout = openFileTab(initialLayout(), "a.ts");
    expect(isSoleDocked(layout, layout.panes[0].tabs.active)).toBe(true);
    expect(isSoleDocked(openFileTab(layout, "b.ts"), layout.panes[0].tabs.active)).toBe(false);
  });
});

describe("floating panels", () => {
  const rect = floatRectAt(300, 200);

  it("places a new panel near the release point, at the usual size", () => {
    expect(rect).toEqual({ x: 240, y: 186, width: 380, height: 300 });
    expect(floatRectAt(10, 5)).toMatchObject({ x: 0, y: 0 });
  });

  it("leaves Start behind when the panel's only tab floats", () => {
    const layout = openFileTab(initialLayout(), "a.ts");
    const floated = floatTab(layout, layout.panes[0].tabs.active, rect);
    expect(shape(floated)).toEqual([["start"]]);
    expect(floated.floats.map((f) => f.tab.path)).toEqual(["a.ts"]);
  });

  it("removes a split pane its last tab floats out of", () => {
    const layout = twoPanes();
    const floated = floatTab(layout, layout.panes[1].tabs.active, rect);
    expect(floated.panes).toHaveLength(1);
    expect(floated.floats).toHaveLength(1);
  });

  it("sends a tab back to the active pane, merging a page already there", () => {
    let layout = openFileTab(initialLayout(), "a.ts");
    layout = floatTab(layout, layout.panes[0].tabs.active, rect);
    const back = unfloat(layout, layout.floats[0].id);
    expect(shape(back)).toEqual([["start", "a.ts"]]);
    expect(back.floats).toEqual([]);

    let pages = openPage(initialLayout(), "files");
    const files = pages.panes[0].tabs.active;
    pages = floatTab(pages, files, rect);
    pages = openPage(pages, "files");
    expect(shape(unfloat(pages, pages.floats[0].id))).toEqual([["files"]]);
  });

  it("raises and places panels, and closes them", () => {
    let layout = openFileTab(initialLayout(), "a.ts");
    layout = openFileTab(layout, "b.ts");
    const [a, b] = layout.panes[0].tabs.tabs;
    layout = floatTab(floatTab(layout, a.id, rect), b.id, rect);
    const [first, second] = layout.floats;
    expect(raiseFloat(layout, first.id).floats.map((f) => f.id)).toEqual([second.id, first.id]);
    const moved = placeFloat(layout, first.id, { ...rect, x: 9 });
    expect(moved.floats[1]).toMatchObject({ id: first.id, rect: { x: 9 } });
    expect(closeFloat(layout, first.id).floats.map((f) => f.id)).toEqual([second.id]);
  });

  it("selects a file already floating instead of opening it again", () => {
    let layout = openFileTab(initialLayout(), "a.ts");
    layout = floatTab(layout, layout.panes[0].tabs.active, rect);
    const again = openFileTab(layout, "a.ts", { line: 7 });
    expect(shape(again)).toEqual([["start"]]);
    expect(again.floats[0].tab.line).toBe(7);
  });

  it("names floating terminals and resolves their shells", () => {
    let layout = openPage(initialLayout(), "terminal");
    const id = layout.panes[0].tabs.active;
    layout = floatTab(layout, id, rect);
    const shell = { name: "bash", path: "/bin/bash" };
    expect(resolveShells(layout, shell).floats[0].tab.shell).toEqual(shell);
    expect(renameTab(layout, id, "logs").floats[0].tab.title).toBe("logs");
  });

  const bounds = { width: 1000, height: 800 };

  it("keeps a resting panel inside the viewport", () => {
    expect(legalRect({ x: -5, y: 900, width: 380, height: 300 }, bounds)).toEqual({
      x: 0,
      y: 500,
      width: 380,
      height: 300,
    });
    expect(legalRect({ x: 0, y: 0, width: 2000, height: 2000 }, bounds)).toMatchObject(bounds);
  });

  it("resists a drag past the edge, up to 120px", () => {
    const inside = { x: 10, y: 10, width: 380, height: 300 };
    expect(resistedRect(inside, bounds)).toEqual(inside);
    const far = resistedRect({ ...inside, x: -100000 }, bounds);
    expect(far.x).toBeLessThan(-110);
    expect(far.x).toBeGreaterThanOrEqual(-120);
  });

  it("resizes within the minimum and the viewport", () => {
    const start = { x: 800, y: 600, width: 380, height: 300 };
    expect(resizedRect(start, -1000, -1000, bounds)).toMatchObject({ width: 220, height: 140 });
    expect(resizedRect({ ...start, x: 100, y: 100 }, 5000, 5000, bounds)).toMatchObject({
      width: 900,
      height: 700,
    });
  });
});
