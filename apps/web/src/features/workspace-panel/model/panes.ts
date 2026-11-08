/** The panel's panes: one, or two side by side, each with its own tabs. */

import {
  activate,
  addStart,
  canClose,
  closeTab,
  initialTabs,
  type OpenFileOptions,
  openFile,
  openTab,
  type PanelTab,
  type PanelTabs,
  type TabKind,
  type TabShell,
} from "./tabs";

export interface Pane {
  id: string;
  /** Which of the panel's two file trees this pane uses. */
  slot: number;
  tabs: PanelTabs;
}

export interface FloatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A tab taken out of the panel, drawn over the page. */
export interface FloatPanel {
  id: string;
  tab: PanelTab;
  rect: FloatRect;
}

export interface PanelLayout {
  panes: Pane[];
  /** Floating panels, bottom to top. */
  floats: FloatPanel[];
  activePane: string;
  /** The first pane's share of the width when split. */
  ratio: number;
  /** Next number for an id; tab ids stay unique across panes. */
  next: number;
}

export const MAX_PANES = 2;
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const EVEN = 0.5;
const FLOAT_SIZE = { width: 380, height: 300 };
/** How far a new panel's corner sits above and left of the release point. */
const GRAB = { x: 60, y: 14 };

/** The rectangle of a tab released at a point outside the panel. */
export const floatRectAt = (x: number, y: number): FloatRect => ({
  x: Math.max(0, x - GRAB.x),
  y: Math.max(0, y - GRAB.y),
  ...FLOAT_SIZE,
});

export function initialLayout(): PanelLayout {
  return {
    panes: [{ id: "pane-0", slot: 0, tabs: initialTabs(1) }],
    floats: [],
    activePane: "pane-0",
    ratio: EVEN,
    next: 2,
  };
}

export const paneOf = (layout: PanelLayout, id: string) => layout.panes.find((p) => p.id === id);
export const activePaneOf = (layout: PanelLayout) =>
  paneOf(layout, layout.activePane) ?? layout.panes[0];

/** Runs a change on one pane's tabs, threading the shared id counter. */
function inPane(
  layout: PanelLayout,
  paneId: string,
  change: (tabs: PanelTabs) => PanelTabs,
): PanelLayout {
  let next = layout.next;
  const panes = layout.panes.map((pane) => {
    if (pane.id !== paneId) return pane;
    const tabs = change({ ...pane.tabs, next });
    next = tabs.next;
    return { ...pane, tabs };
  });
  return { ...layout, panes, next };
}

export const focusPane = (layout: PanelLayout, paneId: string): PanelLayout =>
  layout.activePane === paneId || !paneOf(layout, paneId)
    ? layout
    : { ...layout, activePane: paneId };

export const activateTab = (layout: PanelLayout, paneId: string, tabId: string): PanelLayout =>
  focusPane(
    inPane(layout, paneId, (tabs) => activate(tabs, tabId)),
    paneId,
  );

export const addStartTab = (layout: PanelLayout, paneId: string): PanelLayout =>
  focusPane(inPane(layout, paneId, addStart), paneId);

/** Opens a page in a pane, or in the active one. */
export function openPage(
  layout: PanelLayout,
  kind: Exclude<TabKind, "start" | "file">,
  options: { paneId?: string; shell?: TabShell } = {},
): PanelLayout {
  const paneId = options.paneId ?? activePaneOf(layout).id;
  const opened = focusPane(
    inPane(layout, paneId, (tabs) => openTab(tabs, kind)),
    paneId,
  );
  if (!options.shell) return opened;
  const pane = paneOf(opened, paneId);
  const id = pane?.tabs.active ?? "";
  return mapTab(opened, id, (tab) => ({ ...tab, shell: options.shell }));
}

/** One tab per file across the panel: a file open in either pane is
 * selected there. */
export function openFileTab(
  layout: PanelLayout,
  path: string,
  options: OpenFileOptions = {},
): PanelLayout {
  const floating = layout.floats.find((f) => f.tab.kind === "file" && f.tab.path === path);
  if (floating) {
    const { tab } = floating;
    const shown = { ...tab, line: options.line, revision: (tab.revision ?? 0) + 1 };
    return raiseFloat(
      { ...layout, floats: layout.floats.map((f) => (f === floating ? { ...f, tab: shown } : f)) },
      floating.id,
    );
  }
  const holder = layout.panes.find((p) =>
    p.tabs.tabs.some((t) => t.kind === "file" && t.path === path),
  );
  const paneId = holder?.id ?? activePaneOf(layout).id;
  return focusPane(
    inPane(layout, paneId, (tabs) => openFile(tabs, path, options)),
    paneId,
  );
}

const mapTab = (
  layout: PanelLayout,
  tabId: string,
  change: (tab: PanelTab) => PanelTab,
): PanelLayout => ({
  ...layout,
  panes: layout.panes.map((pane) => ({
    ...pane,
    tabs: { ...pane.tabs, tabs: pane.tabs.tabs.map((t) => (t.id === tabId ? change(t) : t)) },
  })),
  floats: layout.floats.map((f) => (f.tab.id === tabId ? { ...f, tab: change(f.tab) } : f)),
});

export const renameTab = (layout: PanelLayout, tabId: string, title: string): PanelLayout =>
  mapTab(layout, tabId, (tab) => ({ ...tab, title }));

/** Fills in the shell of every terminal still waiting for one. */
export const resolveShells = (layout: PanelLayout, shell: TabShell | null): PanelLayout => ({
  ...layout,
  floats: layout.floats.map((f) =>
    f.tab.kind === "terminal" && f.tab.shell === undefined ? { ...f, tab: { ...f.tab, shell } } : f,
  ),
  panes: layout.panes.map((pane) => ({
    ...pane,
    tabs: {
      ...pane.tabs,
      tabs: pane.tabs.tabs.map((t) =>
        t.kind === "terminal" && t.shell === undefined ? { ...t, shell } : t,
      ),
    },
  })),
});

const freeSlot = (layout: PanelLayout) =>
  [0, 1].find((slot) => !layout.panes.some((p) => p.slot === slot)) ?? 0;

export const canSplit = (layout: PanelLayout) => layout.panes.length < MAX_PANES;

/** Adds a pane on Start after `paneId`, evenly sized, and moves there. */
export function split(layout: PanelLayout, paneId: string): PanelLayout {
  const at = layout.panes.findIndex((p) => p.id === paneId);
  if (at === -1 || !canSplit(layout)) return layout;
  const id = `pane-${layout.next}`;
  const pane: Pane = { id, slot: freeSlot(layout), tabs: initialTabs(layout.next + 1) };
  const panes = [...layout.panes];
  panes.splice(at + 1, 0, pane);
  return { ...layout, panes, activePane: id, ratio: EVEN, next: layout.next + 2 };
}

export const setRatio = (layout: PanelLayout, ratio: number): PanelLayout => ({
  ...layout,
  ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)),
});

/** A lone Start can only close when another pane remains to show. */
export const canCloseTab = (layout: PanelLayout, pane: Pane, tab: PanelTab) =>
  layout.panes.length > 1 || canClose(pane.tabs, tab);

/** The panel's only tab: closing it closes the panel too. */
export const isSoleDocked = (layout: PanelLayout, tabId: string) =>
  layout.panes.length === 1 &&
  layout.panes[0].tabs.tabs.length === 1 &&
  layout.panes[0].tabs.tabs[0].id === tabId;

/** What a tab's menu can close: the tab, the others, those to its right. */
export function menuTabs(layout: PanelLayout, paneId: string, tabId: string) {
  const pane = paneOf(layout, paneId);
  const index = pane?.tabs.tabs.findIndex((t) => t.id === tabId) ?? -1;
  if (!pane || index === -1) return { close: false, others: [], right: [] };
  const closable = pane.tabs.tabs.filter((t) => canCloseTab(layout, pane, t));
  return {
    close: canCloseTab(layout, pane, pane.tabs.tabs[index]),
    others: closable.filter((t) => t.id !== tabId),
    right: pane.tabs.tabs.slice(index + 1).filter((t) => closable.includes(t)),
  };
}

/** Takes a pane out; the panel falls back to the other one. */
function removePane(layout: PanelLayout, paneId: string): PanelLayout {
  const panes = layout.panes.filter((p) => p.id !== paneId);
  const activePane = layout.activePane === paneId ? panes[0].id : layout.activePane;
  return { ...layout, panes, activePane, ratio: EVEN };
}

/** Closes a tab; a pane left with nothing goes away while another remains. */
export function closePaneTab(layout: PanelLayout, paneId: string, tabId: string): PanelLayout {
  const pane = paneOf(layout, paneId);
  if (!pane) return layout;
  const last = pane.tabs.tabs.length === 1 && pane.tabs.tabs[0].id === tabId;
  if (last && layout.panes.length > 1) return removePane(layout, paneId);
  return inPane(layout, paneId, (tabs) => closeTab(tabs, tabId));
}

function detach(tabs: PanelTabs, tabId: string): PanelTabs {
  const index = tabs.tabs.findIndex((t) => t.id === tabId);
  const rest = tabs.tabs.filter((t) => t.id !== tabId);
  if (tabs.active !== tabId) return { ...tabs, tabs: rest };
  return { ...tabs, tabs: rest, active: (rest[index] ?? rest[index - 1])?.id ?? "" };
}

function holderOf(layout: PanelLayout, tabId: string) {
  for (const pane of layout.panes) {
    const tab = pane.tabs.tabs.find((t) => t.id === tabId);
    if (tab) return { pane, tab };
  }
  return null;
}

/** A pane holds one page of each kind; only files and terminals repeat. */
const samePage = (tabs: PanelTabs, tab: PanelTab) =>
  tab.kind === "file" || tab.kind === "terminal"
    ? undefined
    : tabs.tabs.find((t) => t.kind === tab.kind);

/** Puts a tab at `index` of a pane's strip, counted with the tab still in
 * place. A pane left with nothing goes away; a page moved beside the same
 * page merges into it. */
export function moveTab(
  layout: PanelLayout,
  tabId: string,
  toPane: string,
  index?: number,
): PanelLayout {
  const from = holderOf(layout, tabId);
  const target = paneOf(layout, toPane);
  if (!from || !target) return layout;
  const { pane: source, tab } = from;

  if (source.id === toPane) {
    const at = source.tabs.tabs.findIndex((t) => t.id === tabId);
    const to = index ?? source.tabs.tabs.length;
    const place = to > at ? to - 1 : to;
    if (place === at) return layout;
    const rest = source.tabs.tabs.filter((t) => t.id !== tabId);
    rest.splice(place, 0, tab);
    return focusPane(
      inPane(layout, toPane, (tabs) => ({ ...tabs, tabs: rest, active: tabId })),
      toPane,
    );
  }

  const existing = samePage(target.tabs, tab);
  const emptied = source.tabs.tabs.length === 1;
  let out = emptied
    ? removePane(layout, source.id)
    : inPane(layout, source.id, (tabs) => detach(tabs, tabId));
  out = inPane(out, toPane, (tabs) => {
    if (existing) return { ...tabs, active: existing.id };
    const list = [...tabs.tabs];
    list.splice(index ?? list.length, 0, tab);
    return { ...tabs, tabs: list, active: tabId };
  });
  return focusPane(out, toPane);
}

/** Moves a tab into a new pane on one side. The sole tab of a pane leaves
 * Start behind in its place. */
export function dropToSplit(
  layout: PanelLayout,
  tabId: string,
  side: "left" | "right",
): PanelLayout {
  const from = holderOf(layout, tabId);
  if (!from || !canSplit(layout)) return layout;
  const { pane: source, tab } = from;
  const sole = source.tabs.tabs.length === 1;
  const remaining: PanelTabs = sole ? initialTabs(layout.next) : detach(source.tabs, tabId);
  const counter = sole ? layout.next + 1 : layout.next;
  const id = `pane-${counter}`;
  const pane: Pane = {
    id,
    slot: freeSlot(layout),
    tabs: { tabs: [tab], active: tab.id, next: counter + 1 },
  };
  const others = layout.panes.map((p) => (p.id === source.id ? { ...p, tabs: remaining } : p));
  return {
    ...layout,
    panes: side === "left" ? [pane, ...others] : [...others, pane],
    activePane: id,
    ratio: EVEN,
    next: counter + 1,
  };
}

/** What a pane's tabs become without `tabId`; a lone pane is left on Start. */
function withoutTab(layout: PanelLayout, pane: Pane, tabId: string): PanelLayout {
  if (pane.tabs.tabs.length > 1) return inPane(layout, pane.id, (tabs) => detach(tabs, tabId));
  if (layout.panes.length > 1) return removePane(layout, pane.id);
  return {
    ...layout,
    panes: [{ ...pane, tabs: initialTabs(layout.next) }],
    next: layout.next + 1,
  };
}

/** Takes a tab out of the panel into a floating panel on top of the others. */
export function floatTab(layout: PanelLayout, tabId: string, rect: FloatRect): PanelLayout {
  const from = holderOf(layout, tabId);
  if (!from) return layout;
  const out = withoutTab(layout, from.pane, tabId);
  const float: FloatPanel = { id: `float-${out.next}`, tab: from.tab, rect };
  return { ...out, floats: [...out.floats, float], next: out.next + 1 };
}

const withoutFloat = (layout: PanelLayout, id: string): PanelLayout => ({
  ...layout,
  floats: layout.floats.filter((f) => f.id !== id),
});

export const closeFloat = withoutFloat;

/** Sends a floating tab back to the active pane. */
export function unfloat(layout: PanelLayout, id: string): PanelLayout {
  const float = layout.floats.find((f) => f.id === id);
  if (!float) return layout;
  const target = activePaneOf(layout);
  const existing = samePage(target.tabs, float.tab);
  return focusPane(
    inPane(withoutFloat(layout, id), target.id, (tabs) =>
      existing
        ? { ...tabs, active: existing.id }
        : { ...tabs, tabs: [...tabs.tabs, float.tab], active: float.tab.id },
    ),
    target.id,
  );
}

/** Puts a floating panel on top of the others. */
export function raiseFloat(layout: PanelLayout, id: string): PanelLayout {
  const float = layout.floats.find((f) => f.id === id);
  if (!float || layout.floats[layout.floats.length - 1] === float) return layout;
  return { ...layout, floats: [...layout.floats.filter((f) => f !== float), float] };
}

/** Records where a dragged floating panel came to rest, on top of the others. */
export function placeFloat(layout: PanelLayout, id: string, rect: FloatRect): PanelLayout {
  return {
    ...raiseFloat(layout, id),
    floats: raiseFloat(layout, id).floats.map((f) => (f.id === id ? { ...f, rect } : f)),
  };
}
