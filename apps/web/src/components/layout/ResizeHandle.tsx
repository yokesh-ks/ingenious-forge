import { useLayoutEffect, useRef, useState } from "react";

const STEP = 16;

/**
 * The left edge of a panel beside other content: drag or use the arrow keys
 * to resize, double-click to reset. It measures its panel and that panel's
 * parent, so `clamp` can keep both usable.
 */
export default function ResizeHandle({
  label,
  width,
  min,
  max,
  clamp,
  onWidth,
}: {
  label: string;
  width: number | null;
  min: number;
  max: number;
  /** The allowed width for a request, given the parent's width. */
  clamp: (width: number, parent: number) => number;
  onWidth: (width: number | null) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number; parent: number } | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  // The width it reports: the set one, or what the default layout came to.
  const [current, setCurrent] = useState(min);
  useLayoutEffect(() => {
    setCurrent(width ?? Math.round(handle.current?.parentElement?.offsetWidth ?? min));
  }, [width, min]);
  const measure = (element: HTMLElement) => {
    const panel = element.parentElement;
    return {
      width: panel?.getBoundingClientRect().width ?? 0,
      parent: panel?.parentElement?.getBoundingClientRect().width ?? 0,
    };
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter, which <hr> cannot be
    <div
      ref={handle}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={current}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onDoubleClick={() => onWidth(null)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const { width: startWidth, parent } = measure(e.currentTarget);
        drag.current = { startX: e.clientX, startWidth, parent };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const { startX, startWidth, parent } = drag.current;
        onWidth(clamp(startWidth + startX - e.clientX, parent));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const measured = measure(e.currentTarget);
        onWidth(clamp(measured.width + (e.key === "ArrowLeft" ? STEP : -STEP), measured.parent));
      }}
      className="absolute inset-y-0 -left-1 z-[6] w-2 cursor-col-resize touch-none select-none"
    />
  );
}
