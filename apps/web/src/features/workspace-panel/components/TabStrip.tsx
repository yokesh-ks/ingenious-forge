import {
  CompassIcon,
  FolderIcon,
  GitCompareArrowsIcon,
  type LucideIcon,
  PlusIcon,
  SquareSplitHorizontalIcon,
  SquareTerminalIcon,
  XIcon,
} from "lucide-react";
import {
  Fragment,
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { MAX_PANES } from "../model/panes";
import { canAddStart, type PanelTab, type PanelTabs, type TabKind, titleOf } from "../model/tabs";
import FileTypeIcon from "./FileTypeIcon";

const ICONS: Record<Exclude<TabKind, "file">, LucideIcon> = {
  start: CompassIcon,
  files: FolderIcon,
  changes: GitCompareArrowsIcon,
  terminal: SquareTerminalIcon,
};

export const STRIP_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

/** The title fades out over the 16px before the close button. Written out
 * in full so Tailwind can find the classes. */
const FADE_UNDER_CLOSE =
  "group-focus-within:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))] group-hover:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))]";
const ACTIVE_FADE =
  "[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))]";

/** What cannot shrink in a strip must fit twice over, beside one tab each. */
const MIN_CHIP = 100;

function TabIcon({ kind }: { kind: Exclude<TabKind, "file"> }) {
  const Icon = ICONS[kind];
  return (
    <Icon aria-hidden className={cn("size-4 shrink-0", kind === "files" && "text-amber-500")} />
  );
}

/** One tab in the strip; its close button shows while active or hovered. */
function Chip({
  state,
  tab,
  closable,
  dragged,
  onActivate,
  onClose,
  onRename,
  onDragStart,
}: {
  state: PanelTabs;
  tab: PanelTab;
  closable: boolean;
  dragged: boolean;
  onActivate: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
  onDragStart: (event: PointerEvent) => void;
}) {
  const active = tab.id === state.active;
  const title = titleOf(state, tab);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  return (
    <div
      data-chip={tab.id}
      onPointerDown={editing ? undefined : onDragStart}
      className={cn(
        "group relative flex h-7 max-w-[170px] min-w-[100px] shrink touch-none items-center rounded text-[13px] text-muted-foreground hover:bg-muted/60",
        active && "bg-muted text-foreground",
        dragged && "opacity-50",
      )}
    >
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: the field exists because the user asked to type
          autoFocus
          aria-label="Terminal name"
          defaultValue={title}
          maxLength={120}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => {
            setEditing(false);
            const next = event.currentTarget.value.trim();
            if (!cancelled.current && next && next !== title) onRename(next);
            cancelled.current = false;
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
          className="mx-2.5 h-5 w-20 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={active}
          title={title}
          onClick={onActivate}
          onDoubleClick={() => {
            if (tab.kind === "terminal") setEditing(true);
          }}
          className="flex h-full min-w-0 flex-1 items-center px-2.5"
        >
          <span
            className={cn(
              "flex min-w-0 flex-1 items-center gap-[5px] overflow-hidden whitespace-nowrap",
              closable && FADE_UNDER_CLOSE,
              closable && active && ACTIVE_FADE,
            )}
          >
            {tab.kind === "file" ? (
              <FileTypeIcon path={tab.path ?? ""} />
            ) : (
              <TabIcon kind={tab.kind} />
            )}
            {title}
          </span>
        </button>
      )}
      {closable && !editing && (
        <button
          type="button"
          aria-label={`Close ${title}`}
          title="Close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          className={cn(
            "absolute top-1 right-1 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground",
            active && "opacity-100",
          )}
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** A pane's strip: its tabs, New tab, Split and, in the last pane, the
 * panel's own controls. */
export default function TabStrip({
  paneId,
  column,
  state,
  paneCount,
  draggingId,
  closable,
  onActivate,
  onClose,
  onRename,
  onDragStart,
  onAddStart,
  onSplit,
  onRoom,
  children,
}: {
  paneId: string;
  column: number;
  state: PanelTabs;
  paneCount: number;
  draggingId: string | null;
  closable: (tab: PanelTab) => boolean;
  onActivate: (tab: PanelTab) => void;
  onClose: (tab: PanelTab) => void;
  onRename: (tab: PanelTab, title: string) => void;
  onDragStart: (event: PointerEvent, tab: PanelTab) => void;
  onAddStart: () => void;
  onSplit: () => void;
  /** Reports whether this pane is wide enough to halve. */
  onRoom: (room: boolean) => void;
  /** The panel's own controls, in the last pane only. */
  children?: ReactNode;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState(true);
  const report = useRef(onRoom);
  report.current = onRoom;

  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const fixed = width - (list.current?.offsetWidth ?? 0) - (fill.current?.offsetWidth ?? 0);
      const next = width === 0 || width / 2 >= fixed + MIN_CHIP;
      setRoom(next);
      report.current(next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, []);

  const limit = paneCount >= MAX_PANES;
  const reason = limit
    ? "Two panes is the limit"
    : room
      ? null
      : "Not enough width to split, widen the sidebar";

  return (
    <div
      ref={strip}
      data-pane-strip={paneId}
      style={{ gridColumn: column, gridRow: 1 }}
      className="flex h-[38px] min-w-0 items-center gap-1 pt-2.5 pr-1.5 pl-2.5"
    >
      <div
        ref={list}
        role="tablist"
        aria-label="Workspace panel tabs"
        className="flex min-w-0 shrink items-center overflow-x-auto [scrollbar-width:none]"
      >
        {state.tabs.map((tab, index) => {
          const previous = state.tabs[index - 1];
          const blank = tab.id === state.active || previous?.id === state.active;
          return (
            <Fragment key={tab.id}>
              {index > 0 && (
                <span aria-hidden className="flex h-7 w-2.5 shrink-0 items-center justify-center">
                  <span className={cn("h-3.5 w-px bg-border", blank && "bg-transparent")} />
                </span>
              )}
              <Chip
                state={state}
                tab={tab}
                closable={closable(tab)}
                dragged={draggingId === tab.id}
                onActivate={() => onActivate(tab)}
                onClose={() => onClose(tab)}
                onRename={(title) => onRename(tab, title)}
                onDragStart={(event) => onDragStart(event, tab)}
              />
            </Fragment>
          );
        })}
      </div>
      {canAddStart(state) && (
        <button
          type="button"
          aria-label="New tab"
          title="New tab"
          className={STRIP_BUTTON}
          onClick={onAddStart}
        >
          <PlusIcon aria-hidden className="size-4" />
        </button>
      )}
      <span ref={fill} className="min-w-0 flex-1" />
      <div className="ml-1 flex shrink-0 items-center gap-2">
        <span title={reason ?? "Split"} className="flex">
          <button
            type="button"
            aria-label="Split"
            disabled={reason !== null}
            className={STRIP_BUTTON}
            onClick={onSplit}
          >
            <SquareSplitHorizontalIcon aria-hidden className="size-4" />
          </button>
        </span>
        {children}
      </div>
    </div>
  );
}
