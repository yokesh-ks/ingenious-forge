import { type PointerEvent as ReactPointerEvent, type RefObject, useRef, useState } from "react";

export type DropTarget =
  | { kind: "strip"; pane: string; index: number; caretX: number; caretY: number }
  | { kind: "move"; pane: string }
  | { kind: "split"; pane: string; side: "left" | "right" };

/** How far the pointer moves before a press on a tab becomes a drag. */
const THRESHOLD = 4;

const inside = (rect: DOMRect, x: number, y: number) =>
  x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;

/**
 * Dragging a tab: along a strip to reorder it, to the other pane's strip or
 * body to move it, or to one side of a lone pane to split it. The result is
 * reported once, on release. `canDropToSplit` says whether a lone pane has
 * room for two.
 */
export function useTabDrag({
  root,
  paneCount,
  canDropToSplit,
  onDrop,
}: {
  root: RefObject<HTMLElement | null>;
  paneCount: () => number;
  canDropToSplit: () => boolean;
  onDrop: (tabId: string, target: DropTarget) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const moved = useRef(false);

  const locate = (x: number, y: number, tabId: string): DropTarget | null => {
    const element = root.current;
    if (!element) return null;
    const origin = element.getBoundingClientRect();
    for (const strip of element.querySelectorAll<HTMLElement>("[data-pane-strip]")) {
      const rect = strip.getBoundingClientRect();
      if (!inside(rect, x, y)) continue;
      const pane = strip.dataset.paneStrip ?? "";
      const chips = [...strip.querySelectorAll<HTMLElement>("[data-chip]")];
      const index = chips.filter((chip) => {
        const box = chip.getBoundingClientRect();
        return box.left + box.width / 2 < x;
      }).length;
      const own = chips.findIndex((chip) => chip.dataset.chip === tabId);
      // A slot beside the tab would leave it where it is.
      if (own !== -1 && (index === own || index === own + 1)) return null;
      const edge = chips[index]
        ? chips[index].getBoundingClientRect().left - 5
        : (chips[chips.length - 1]?.getBoundingClientRect().right ?? rect.left) + 5;
      return { kind: "strip", pane, index, caretX: edge - origin.left, caretY: 14 };
    }
    for (const body of element.querySelectorAll<HTMLElement>("[data-pane-body]")) {
      const rect = body.getBoundingClientRect();
      if (!inside(rect, x, y)) continue;
      const pane = body.dataset.paneBody ?? "";
      if (paneCount() === 1 && canDropToSplit()) {
        return { kind: "split", pane, side: x < rect.left + rect.width / 2 ? "left" : "right" };
      }
      return { kind: "move", pane };
    }
    return null;
  };

  const begin = (event: ReactPointerEvent, tabId: string) => {
    if (event.button !== 0) return;
    moved.current = false;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    let latest: DropTarget | null = null;

    const onMove = (e: PointerEvent) => {
      if (!active && Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
      if (!active) {
        active = true;
        moved.current = true;
        setDragging(tabId);
      }
      latest = locate(e.clientX, e.clientY, tabId);
      setTarget(latest);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      setDragging(null);
      setTarget(null);
      if (commit && active && latest) onDrop(tabId, latest);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  /** True when the press that just ended was a drag, not a click. */
  const consumeDrag = () => {
    const was = moved.current;
    moved.current = false;
    return was;
  };

  return { dragging, target, begin, consumeDrag };
}
