/** The panel's tabs. Start is a doorway: a page opened from it takes its
 * place, and New tab brings it back. */

export type TabKind = "start" | "files" | "changes" | "terminal";

export interface PanelTab {
  id: string;
  kind: TabKind;
}

export interface PanelTabs {
  tabs: PanelTab[];
  active: string;
  /** Next number for a tab id, so ids are never reused. */
  next: number;
}

const make = (state: PanelTabs, kind: TabKind): [PanelTab, number] => [
  { id: `${kind}-${state.next}`, kind },
  state.next + 1,
];

export function initialTabs(next = 1): PanelTabs {
  const id = `start-${next}`;
  return { tabs: [{ id, kind: "start" }], active: id, next: next + 1 };
}

const isStart = (tab: PanelTab | undefined) => tab?.kind === "start";
const activeTab = (state: PanelTabs) => state.tabs.find((t) => t.id === state.active);

/** Files and Changes open once; a terminal opens as often as asked. */
export function openTab(state: PanelTabs, kind: Exclude<TabKind, "start">): PanelTabs {
  const current = activeTab(state);
  const existing = kind === "terminal" ? undefined : state.tabs.find((t) => t.kind === kind);
  if (existing) {
    return {
      ...state,
      tabs: isStart(current) ? state.tabs.filter((t) => t.id !== current?.id) : state.tabs,
      active: existing.id,
    };
  }
  if (isStart(current) && current) {
    const [tab, next] = make(state, kind);
    return {
      tabs: state.tabs.map((t) => (t.id === current.id ? tab : t)),
      active: tab.id,
      next,
    };
  }
  return appendTab(state, kind);
}

function appendTab(state: PanelTabs, kind: TabKind): PanelTabs {
  const [tab, next] = make(state, kind);
  return { tabs: [...state.tabs, tab], active: tab.id, next };
}

export const activate = (state: PanelTabs, id: string): PanelTabs => ({ ...state, active: id });

/** New tab appears only while no Start tab is open. */
export const canAddStart = (state: PanelTabs) => !state.tabs.some((t) => t.kind === "start");

export const addStart = (state: PanelTabs): PanelTabs =>
  canAddStart(state) ? appendTab(state, "start") : state;

/** Everything can close except a Start tab with nothing beside it. */
export const canClose = (state: PanelTabs, tab: PanelTab) =>
  !(tab.kind === "start" && state.tabs.length === 1);

export function closeTab(state: PanelTabs, id: string): PanelTabs {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index === -1) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (tabs.length === 0) return initialTabs(state.next);
  if (state.active !== id) return { ...state, tabs };
  return { ...state, tabs, active: (tabs[index] ?? tabs[index - 1]).id };
}

const TITLES: Record<TabKind, string> = {
  start: "Start",
  files: "Files",
  changes: "Changes",
  terminal: "Terminal",
};

/** A tab's title; later terminals are numbered in the order they opened. */
export function titleOf(state: PanelTabs, tab: PanelTab): string {
  if (tab.kind !== "terminal") return TITLES[tab.kind];
  const position = state.tabs.filter((t) => t.kind === "terminal").indexOf(tab);
  return position === 0 ? "Terminal" : `Terminal ${position + 1}`;
}
