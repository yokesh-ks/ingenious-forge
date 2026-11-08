/** Each session's panel, kept across reloads in this browser. */

import { z } from "zod";
import type { PanelLayout } from "./panes";

const PREFIX = "forge.workspace-panel.v1.";
const WIDTH_KEY = "forge.workspace-panel.width";

const tab = z.object({
  id: z.string().min(1),
  kind: z.enum(["start", "files", "changes", "terminal", "file"]),
  path: z.string().optional(),
  line: z.number().optional(),
  revision: z.number().optional(),
  shell: z.object({ name: z.string(), path: z.string() }).nullable().optional(),
  title: z.string().optional(),
});

const pane = z.object({
  id: z.string().min(1),
  slot: z.number().int().min(0).max(1),
  tabs: z.object({ tabs: z.array(tab).min(1), active: z.string(), next: z.number().int() }),
});

const float = z.object({
  id: z.string().min(1),
  tab,
  rect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
});

const saved = z.object({
  open: z.boolean(),
  fullscreen: z.boolean(),
  layout: z.object({
    panes: z.array(pane).min(1).max(2),
    floats: z.array(float),
    activePane: z.string(),
    ratio: z.number().min(0.2).max(0.8),
    next: z.number().int().positive(),
  }),
});

export interface SavedPanel {
  open: boolean;
  fullscreen: boolean;
  layout: PanelLayout;
}

/** Every id appears once, and everything selected exists. */
function consistent({ layout }: SavedPanel): boolean {
  const tabs = [...layout.panes.flatMap((p) => p.tabs.tabs), ...layout.floats.map((f) => f.tab)];
  const ids = [...tabs.map((t) => t.id), ...layout.panes.map((p) => p.id)];
  return (
    new Set(ids).size === ids.length &&
    new Set(layout.panes.map((p) => p.slot)).size === layout.panes.length &&
    layout.panes.some((p) => p.id === layout.activePane) &&
    layout.panes.every((p) => p.tabs.tabs.some((t) => t.id === p.tabs.active))
  );
}

const number = (id: string) => Number(id.replace(/^\D+/, "")) || 0;

/** A file reopens at its top: the line was a one-time request. */
function restored(value: SavedPanel): SavedPanel {
  const forget = <T extends { line?: number }>({ line: _line, ...tab }: T) => tab;
  const { layout } = value;
  const ids = [
    ...layout.panes.flatMap((p) => [p.id, ...p.tabs.tabs.map((t) => t.id)]),
    ...layout.floats.flatMap((f) => [f.id, f.tab.id]),
  ];
  return {
    ...value,
    layout: {
      ...layout,
      next: Math.max(layout.next, ...ids.map((id) => number(id) + 1)),
      panes: layout.panes.map((p) => ({
        ...p,
        tabs: { ...p.tabs, tabs: p.tabs.tabs.map(forget) },
      })),
      floats: layout.floats.map((f) => ({ ...f, tab: forget(f.tab) })),
    },
  };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The session's saved panel, or `null` when absent or damaged. */
export function readPanel(sessionId: string): SavedPanel | null {
  const store = storage();
  const key = PREFIX + sessionId;
  let raw: string | null = null;
  try {
    raw = store?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value = saved.parse(JSON.parse(raw)) as SavedPanel;
    if (!consistent(value)) throw new Error("inconsistent");
    return restored(value);
  } catch {
    try {
      store?.removeItem(key);
    } catch {
      // The damaged value is still ignored for this window.
    }
    return null;
  }
}

export function writePanel(sessionId: string, panel: SavedPanel) {
  try {
    storage()?.setItem(PREFIX + sessionId, JSON.stringify(panel));
  } catch (error) {
    console.error("Could not save the workspace panel", error);
  }
}

export function readWidth(): number | null {
  try {
    const width = Number(storage()?.getItem(WIDTH_KEY));
    return Number.isFinite(width) && width > 0 ? width : null;
  } catch {
    return null;
  }
}

export function writeWidth(width: number) {
  try {
    storage()?.setItem(WIDTH_KEY, String(width));
  } catch {
    // Only a convenience: the panel keeps its width until reload.
  }
}
