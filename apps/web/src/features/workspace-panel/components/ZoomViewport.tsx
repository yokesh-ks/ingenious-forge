import { ChevronDownIcon, MinusIcon, PlusIcon } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ZoomPreference = { kind: "fit-width" } | { kind: "fixed"; scale: number };

export const FIT_WIDTH: ZoomPreference = { kind: "fit-width" };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const STEP = 0.25;
const PRESETS = [0.25, 0.5, 1, 1.5, 2];
const PINCH_SETTLE_MS = 120;
const CONTROLS_HIDE_MS = 420;
/** Moving the pointer this close to the bottom shows the controls. */
const REVEAL_HEIGHT = 72;

/** Goes on what is drawn at the zoomed size; it needs `--document-zoom-width`. */
export const ZOOM_SURFACE =
  "max-w-none [[data-document-zoom-mode=fit-width]_&]:w-[min(var(--document-zoom-width),100%)] [[data-document-zoom-mode=fixed]_&]:w-[calc(var(--document-zoom-width)*var(--document-zoom))]";

const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

function stepped(zoom: number, direction: 1 | -1): number {
  const step = direction === -1 ? Math.ceil(zoom / STEP) - 1 : Math.floor(zoom / STEP) + 1;
  return clamp(step * STEP);
}

/** The scale at which content fits: never above its own size. */
export function fitWidthZoom(viewport: number, intrinsic: number | undefined, inset = 0): number {
  if (!intrinsic || intrinsic <= 0) return 1;
  return Math.min(1, Math.max(1, viewport - inset) / intrinsic);
}

const CONTROL =
  "flex size-7 flex-none items-center justify-center rounded-md hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent";

function ZoomControls({
  zoom,
  fitted,
  visible,
  onZoom,
  onFit,
  onActive,
}: {
  zoom: number;
  fitted: boolean;
  visible: boolean;
  onZoom: (zoom: number) => void;
  onFit: () => void;
  onActive: (active: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => onActive(open || hovered || focused), [open, hovered, focused, onActive]);
  return (
    <div
      role="toolbar"
      aria-label="Zoom controls"
      data-document-zoom-controls=""
      data-document-zoom-visible={visible || undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={cn(
        "absolute start-1/2 bottom-3.5 z-[2] flex items-center gap-0.5 rounded-xl border-[0.5px] border-border bg-background px-1.5 py-1 text-xs leading-[18px] shadow-[0_8px_24px_#0000001a,0_2px_5px_#00000009] transition-[opacity,transform] duration-150 motion-reduce:transition-none",
        visible
          ? "translate-x-[-50%] opacity-100"
          : "pointer-events-none translate-x-[-50%] translate-y-4 scale-[0.98] opacity-0 pointer-coarse:pointer-events-auto pointer-coarse:translate-y-0 pointer-coarse:scale-100 pointer-coarse:opacity-100",
      )}
    >
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= MIN_ZOOM}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onZoom(stepped(zoom, -1))}
        className={CONTROL}
      >
        <MinusIcon aria-hidden className="size-3.5" />
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Choose zoom"
            onMouseDown={(event) => event.preventDefault()}
            className="inline-flex h-7 min-w-14 items-center justify-center gap-0.5 rounded-md tabular-nums hover:bg-muted"
          >
            <span>{Math.round(zoom * 100)}%</span>
            <ChevronDownIcon aria-hidden className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-28">
          <DropdownMenuItem data-selected={fitted || undefined} onSelect={onFit}>
            Fit width
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {PRESETS.map((value) => (
            <DropdownMenuItem
              key={value}
              data-selected={(!fitted && value === zoom) || undefined}
              onSelect={() => onZoom(value)}
            >
              {value * 100}%
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onZoom(stepped(zoom, 1))}
        className={CONTROL}
      >
        <PlusIcon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

/** Scrolls and zooms a document: fit to width or a fixed scale, by pinch or
 * by the controls that appear near the bottom edge. */
export default function ZoomViewport({
  preference,
  intrinsicWidth,
  horizontalInset = 0,
  onPreference,
  onRenderZoom,
  children,
}: {
  preference: ZoomPreference;
  intrinsicWidth: number | undefined;
  horizontalInset?: number;
  onPreference: (preference: ZoomPreference) => void;
  /** The scale to draw at, once a gesture settles. */
  onRenderZoom?: (zoom: number) => void;
  children: ReactNode;
}) {
  const [viewport, setViewport] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pinching, setPinching] = useState<number | null>(null);
  const port = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const pinchTimer = useRef<number | undefined>(undefined);
  const nearEdge = useRef(false);
  const active = useRef(false);
  const fitZoom = fitWidthZoom(viewport, intrinsicWidth, horizontalInset);
  const settled = preference.kind === "fit-width" ? fitZoom : preference.scale;
  const zoom = pinching ?? settled;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const mode = pinching !== null ? "fixed" : preference.kind;

  const show = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setVisible(true);
  }, []);
  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    if (nearEdge.current || active.current || pinchTimer.current !== undefined) return;
    hideTimer.current = window.setTimeout(() => setVisible(false), CONTROLS_HIDE_MS);
  }, []);
  const onActive = useCallback(
    (now: boolean) => {
      active.current = now;
      if (now) show();
      else scheduleHide();
    },
    [show, scheduleHide],
  );

  /** Keeps the point under the anchor still as the scale changes. */
  const keepAnchor = useCallback((previous: number, next: number, x?: number, y?: number) => {
    const node = port.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const px = x === undefined ? node.clientWidth / 2 : x - box.left;
    const py = y === undefined ? node.clientHeight / 2 : y - box.top;
    const ratio = next / previous;
    const left = (node.scrollLeft + px) * ratio - px;
    const top = (node.scrollTop + py) * ratio - py;
    requestAnimationFrame(() => {
      node.scrollLeft = left;
      node.scrollTop = top;
    });
  }, []);

  const setZoom = (next: number) => {
    keepAnchor(zoomRef.current, next);
    onPreference({ kind: "fixed", scale: clamp(next) });
  };

  useLayoutEffect(() => {
    const node = port.current;
    if (!node) return;
    const measure = () => setViewport(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // A hidden tab has no width yet; there is nothing to draw it at.
    if (pinching === null && (viewport > 0 || preference.kind === "fixed")) onRenderZoom?.(settled);
  }, [pinching, settled, onRenderZoom, viewport, preference.kind]);

  useEffect(() => {
    const node = port.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      show();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? node.clientHeight
            : 1;
      const delta = Math.max(-40, Math.min(40, event.deltaY * unit));
      const previous = zoomRef.current;
      const next = clamp(previous * Math.exp(-delta * 0.01));
      zoomRef.current = next;
      keepAnchor(previous, next, event.clientX, event.clientY);
      setPinching(next);
      window.clearTimeout(pinchTimer.current);
      pinchTimer.current = window.setTimeout(() => {
        pinchTimer.current = undefined;
        setPinching(null);
        onPreference({ kind: "fixed", scale: zoomRef.current });
        scheduleHide();
      }, PINCH_SETTLE_MS);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", wheel);
      window.clearTimeout(pinchTimer.current);
      pinchTimer.current = undefined;
    };
  }, [keepAnchor, onPreference, scheduleHide, show]);

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const inZone =
      event.pointerType === "mouse" &&
      event.clientY >= event.currentTarget.getBoundingClientRect().bottom - REVEAL_HEIGHT;
    nearEdge.current = inZone;
    if (inZone) show();
    else scheduleHide();
  };

  return (
    <section
      data-document-zoom-frame=""
      data-document-zoom-mode={mode}
      style={{ "--document-zoom": zoom } as CSSProperties}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        nearEdge.current = false;
        scheduleHide();
      }}
      className="relative h-full min-h-0 overflow-hidden"
    >
      <div ref={port} data-document-zoom-scrollport="" className="h-full overflow-auto">
        {children}
      </div>
      {intrinsicWidth !== undefined && (
        <ZoomControls
          zoom={zoom}
          fitted={mode === "fit-width"}
          visible={visible}
          onZoom={setZoom}
          onFit={() => onPreference(FIT_WIDTH)}
          onActive={onActive}
        />
      )}
    </section>
  );
}
