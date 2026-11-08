import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TrajectoryRecord } from "../model/build-trajectory";
import {
  buildTimeline,
  commitRange,
  domainOf,
  nearestSpan,
  panViewport,
  revealSpan,
  type TimelineMode,
  type TimelineModel,
  type TimelineSpan,
  type TimeRange,
  tooltipLabel,
  zoomViewport,
} from "../model/timeline";

/** Pointer travel below this is a click, not a drag. */
const MIN_DRAG_PX = 3;
const HOVER_DELAY_MS = 500;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const COLORS: Record<TimelineSpan["kind"], string> = {
  system: "bg-muted-foreground opacity-80",
  user: "bg-blue-500 opacity-80",
  context: "bg-green-600/70 opacity-80",
  assistant: "bg-violet-500",
  tool: "bg-orange-500",
};

function Frame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Trajectory timeline"
      className="relative isolate shrink-0 border-b select-none"
    >
      <div className="grid h-[50px] grid-cols-[44px_minmax(0,1fr)] overflow-hidden bg-muted/50">
        <div
          aria-hidden
          className="relative border-r text-[10px] leading-none text-muted-foreground"
        >
          {["Input", "Model", "Tools"].map((label, lane) => (
            <span
              key={label}
              className="absolute right-[3px] flex h-2 items-center"
              style={{ top: 7 + lane * 14 }}
            >
              {label}
            </span>
          ))}
        </div>
        {children}
      </div>
    </section>
  );
}

function EarlierButton({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  return (
    <button
      type="button"
      aria-label={loading ? "Loading earlier history…" : "Load earlier history"}
      aria-disabled={loading}
      title={loading ? "Loading earlier history…" : "Click to load earlier history"}
      onClick={() => {
        if (!loading) onLoad();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      className="absolute inset-y-0 left-0 z-[5] flex w-7 items-center bg-gradient-to-r from-muted from-40% to-transparent pl-[3px] text-xs text-muted-foreground opacity-70 hover:opacity-100"
    >
      …
    </button>
  );
}

/** One bar, with its hover detail. */
function SpanBar({
  span,
  model,
  full,
  mode,
  selected,
  hovered,
  active,
  searchIds,
}: {
  span: TimelineSpan;
  model: TimelineModel;
  full: number;
  mode: TimelineMode;
  selected: boolean;
  hovered: boolean;
  active: TimeRange | null;
  searchIds: Set<string> | null;
}) {
  const width = ((span.end - span.start) / full) * 100;
  const split =
    span.ttftMs !== null && span.decodingMs !== null && span.ttftMs + span.decodingMs > 0
      ? (span.ttftMs / (span.ttftMs + span.decodingMs)) * 100
      : null;
  const inRange = active === null ? null : span.start <= active.end && span.end >= active.start;
  const matches = searchIds === null ? null : searchIds.has(span.id);
  const gap = `min(${width * 0.08}%, 1px)`;
  const style = {
    "--span-width": `${width}%`,
    top: span.lane * 14,
    left: `calc(${((span.start - model.start) / full) * 100}% + ${gap})`,
    width: `max(2px, calc(var(--span-width) - ${gap} - ${gap}))`,
    ...(split === null
      ? {}
      : {
          background: `linear-gradient(to right, color-mix(in srgb, var(--color-violet-500) 45%, transparent) ${split}%, var(--color-violet-500) ${split}%)`,
        }),
  } as CSSProperties;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-hidden
          data-timeline-id={span.id}
          data-timeline-kind={span.kind}
          data-current={selected || undefined}
          data-mode={mode}
          data-selected={inRange === null ? undefined : String(inRange)}
          data-search-match={matches === null ? undefined : String(matches)}
          style={style}
          className={cn(
            "absolute h-2 min-w-[2px] rounded-[1px]",
            COLORS[span.kind],
            span.isError && "bg-destructive",
            inRange === false && "opacity-20",
            matches === false && "opacity-[0.14]",
            hovered && !selected && "z-[1] opacity-100 ring-2 ring-blue-500/80",
            selected && "z-[1] opacity-100 ring-2 ring-blue-600 ring-offset-1 ring-offset-muted",
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="whitespace-pre-line">
        {tooltipLabel(span)}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The overview above the ledger: every record as a bar in the Input, Model
 * or Tools lane. Dragging selects a range, the wheel zooms, a right-drag
 * pans; a right-click, a double-click or Escape clears the range.
 */
export default function TrajectoryTimeline({
  records,
  mode,
  range,
  selectedId,
  searchIds,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onRangeChange,
  onSelect,
  onFocusRecord,
}: {
  records: TrajectoryRecord[];
  mode: TimelineMode;
  range: TimeRange | null;
  selectedId: string | null;
  searchIds: Set<string> | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRangeChange: (range: TimeRange | null) => void;
  onSelect: (id: string) => void;
  /** Bring the record nearest a click on empty track into view. */
  onFocusRecord: (id: string) => void;
}) {
  const model = useMemo(() => buildTimeline(records, mode), [records, mode]);
  const [viewport, setViewport] = useState<TimeRange | null>(null);
  const [draft, setDraft] = useState<TimeRange | null>(null);
  const [hover, setHover] = useState<{ fraction: number; id: string | null } | null>(null);
  const [panning, setPanning] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointer: number;
    anchorTime: number;
    anchorX: number;
    id: string | null;
  } | null>(null);
  const panRef = useRef<{
    pointer: number;
    anchorX: number;
    anchorStart: number;
    moved: boolean;
  } | null>(null);

  // A range or zoom that no longer overlaps the session means nothing.
  useEffect(() => {
    if (model && range && (range.end < model.start || range.start > model.end)) onRangeChange(null);
    if (model) {
      setViewport((v) => (v && (v.end < model.start || v.start > model.end) ? null : v));
    }
  }, [model, range, onRangeChange]);

  // Keep the selected record on screen while zoomed.
  useEffect(() => {
    const span = model?.spans.find((s) => s.id === selectedId);
    if (model && span) setViewport((v) => revealSpan(model, v, span));
  }, [model, selectedId]);

  const domain = model ? domainOf(model, viewport) : null;

  // React's wheel listener is passive, and this one must stop the page.
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track || !model) return;
    const rect = track.getBoundingClientRect();
    const anchor = clamp01((e.clientX - rect.left) / Math.max(1, rect.width));
    setViewport((v) => zoomViewport(model, mode, v, anchor, e.deltaY));
  };
  const hasTrack = model !== null;
  useEffect(() => {
    const track = trackRef.current;
    if (!hasTrack || !track) return;
    const listener = (e: WheelEvent) => wheel.current(e);
    track.addEventListener("wheel", listener, { passive: false });
    return () => track.removeEventListener("wheel", listener);
  }, [hasTrack]);

  if (!model || !domain) {
    return (
      <Frame>
        <div className="relative overflow-hidden">
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            No timing data
          </span>
          {hasOlder && <EarlierButton loading={loadingOlder} onLoad={onLoadOlder} />}
        </div>
      </Frame>
    );
  }

  const full = Math.max(1, model.end - model.start);
  const fractionAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return clamp01((e.clientX - rect.left) / Math.max(1, rect.width));
  };
  const timeAt = (fraction: number) => domain.start + fraction * domain.duration;
  const idAt = (e: PointerEvent<HTMLDivElement>) =>
    e.target instanceof Element
      ? (e.target.closest("[data-timeline-id]")?.getAttribute("data-timeline-id") ?? null)
      : null;
  const capture = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      panRef.current = {
        pointer: e.pointerId,
        anchorX: e.clientX,
        anchorStart: domain.start,
        moved: false,
      };
      setPanning(true);
      capture(e);
      return;
    }
    if (e.button !== 0) return;
    const fraction = fractionAt(e);
    const anchorTime = timeAt(fraction);
    const id = idAt(e);
    setHover({ fraction, id });
    dragRef.current = { pointer: e.pointerId, anchorTime, anchorX: e.clientX, id };
    capture(e);
    setDraft({ start: anchorTime, end: anchorTime });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const fraction = fractionAt(e);
    setHover({ fraction, id: idAt(e) });
    const pan = panRef.current;
    if (pan && pan.pointer === e.pointerId) {
      if (Math.abs(e.clientX - pan.anchorX) >= MIN_DRAG_PX) pan.moved = true;
      if (viewport) {
        const width = Math.max(1, e.currentTarget.getBoundingClientRect().width);
        setViewport(panViewport(model, domain, pan.anchorStart, (e.clientX - pan.anchorX) / width));
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointer !== e.pointerId) return;
    const point = timeAt(fraction);
    setDraft({ start: Math.min(drag.anchorTime, point), end: Math.max(drag.anchorTime, point) });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && pan.pointer === e.pointerId) {
      const moved = pan.moved || Math.abs(e.clientX - pan.anchorX) >= MIN_DRAG_PX;
      panRef.current = null;
      setPanning(false);
      if (!moved) onRangeChange(null);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointer !== e.pointerId) return;
    dragRef.current = null;
    setDraft(null);
    const click = Math.abs(e.clientX - drag.anchorX) < MIN_DRAG_PX;
    if (click && drag.id) {
      onRangeChange(null);
      onSelect(drag.id);
      return;
    }
    if (click) onFocusRecord(nearestSpan(model, drag.anchorTime).id);
    onRangeChange(commitRange(model, domain, drag.anchorTime, timeAt(fractionAt(e))));
  };

  const cancel = () => {
    dragRef.current = null;
    panRef.current = null;
    setDraft(null);
    setHover(null);
    setPanning(false);
  };

  const shownRange = draft ?? range;
  const fractions = shownRange && {
    start: (clampTo(shownRange.start, model) - domain.start) / domain.duration,
    end: (clampTo(shownRange.end, model) - domain.start) / domain.duration,
  };
  const projected: CSSProperties = {
    left: `${(-(domain.start - model.start) / domain.duration) * 100}%`,
    width: `${(full / domain.duration) * 100}%`,
  };
  const end = domain.start + domain.duration;

  return (
    <Frame>
      <TooltipProvider delayDuration={HOVER_DELAY_MS} disableHoverableContent>
        <div
          ref={trackRef}
          role="application"
          aria-label="Timeline overview; drag horizontally to focus events"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focus is what lets Escape clear the range
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Escape" && range) {
              e.preventDefault();
              onRangeChange(null);
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancel}
          onPointerLeave={() => {
            if (!dragRef.current && !panRef.current) setHover(null);
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            onRangeChange(null);
          }}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            "relative touch-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-blue-600 focus-visible:ring-inset",
            panning ? "cursor-grabbing" : "cursor-crosshair",
          )}
        >
          {hasOlder && domain.start === model.start && (
            <EarlierButton loading={loadingOlder} onLoad={onLoadOlder} />
          )}
          {hover && hover.id === null && !draft && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[4] w-0.5 bg-blue-500"
              style={{ left: `clamp(0px, calc(${hover.fraction * 100}% - 1px), calc(100% - 2px))` }}
            />
          )}
          {fractions && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[4] min-w-px border-x-[3px] border-blue-500 bg-blue-500/10 shadow-[-100vw_0_0_100vw_color-mix(in_srgb,var(--color-background)_58%,transparent),100vw_0_0_100vw_color-mix(in_srgb,var(--color-background)_58%,transparent)]"
              style={{
                left: `${fractions.start * 100}%`,
                width: `${(fractions.end - fractions.start) * 100}%`,
              }}
            />
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-[3]"
            style={projected}
          >
            {model.turnBoundaries
              .filter((b) => b.time > model.start && b.time >= domain.start && b.time <= end)
              .map((b) => (
                <span
                  key={b.turn}
                  className="absolute inset-y-0 w-px bg-border"
                  style={{ left: `${((b.time - model.start) / full) * 100}%` }}
                />
              ))}
          </div>
          <div className="absolute top-[7px] bottom-[7px] z-[2]" style={projected}>
            {model.spans
              .filter((s) => s.id === selectedId || (s.end >= domain.start && s.start <= end))
              .map((span) => (
                <SpanBar
                  key={span.id}
                  span={span}
                  model={model}
                  full={full}
                  mode={mode}
                  selected={span.id === selectedId}
                  hovered={hover?.id === span.id}
                  active={shownRange}
                  searchIds={searchIds}
                />
              ))}
          </div>
        </div>
      </TooltipProvider>
    </Frame>
  );
}

const clampTo = (value: number, model: TimelineModel) =>
  Math.min(model.end, Math.max(model.start, value));
