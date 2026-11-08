import {
  BoxIcon,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { primaryShortcutLabel, shortcutLabel } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { MAX_PANES } from "../model/panes";
import { canAddStart, type PanelTab, type PanelTabs, type TabKind, titleOf } from "../model/tabs";
import FileTypeIcon from "./FileTypeIcon";

const ICONS: Record<Exclude<TabKind, "file">, LucideIcon> = {
  start: CompassIcon,
  files: FolderIcon,
  changes: GitCompareArrowsIcon,
  terminal: SquareTerminalIcon,
  log: BoxIcon,
};

export const STRIP_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

/** The title fades out over the 16px before the close button. Written out
 * in full so Tailwind can find the classes. */
const FADE_UNDER_CLOSE =
  "group-focus-within:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))] group-hover:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))]";
const ACTIVE_FADE =
  "[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))]";

/** What cannot shrink in a strip must fit twice over, beside one tab each. */
const MIN_CHIP = 100;

export function TabIcon({ kind }: { kind: Exclude<TabKind, "file"> }) {
  const Icon = ICONS[kind];
  return (
    <Icon aria-hidden className={cn("size-4 shrink-0", kind === "files" && "text-amber-500")} />
  );
}

const MENU =
  "min-w-[96px] rounded-[16px] p-1 shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_3px_8px_rgba(0,0,0,0.04),0_0_20px_rgba(0,0,0,0.05)]";
const MENU_ITEM =
  "min-h-[34px] rounded-[12px] px-2 py-1.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5";

/** What a tab's menu offers. */
export interface TabMenu {
  close: boolean;
  others: PanelTab[];
  right: PanelTab[];
}

/** A hint under a strip control, naming its shortcut when it has one. */
export function StripTip({
  label,
  keys,
  children,
}: {
  label: string;
  keys?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {keys && <span className="ml-2 opacity-70">{keys}</span>}
      </TooltipContent>
    </Tooltip>
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
  onCloseMany,
  onRename,
  onDragStart,
  menu,
}: {
  state: PanelTabs;
  tab: PanelTab;
  closable: boolean;
  dragged: boolean;
  menu: TabMenu;
  onActivate: () => void;
  onClose: () => void;
  onCloseMany: (tabs: PanelTab[]) => void;
  onRename: (title: string) => void;
  onDragStart: (event: PointerEvent) => void;
}) {
  const active = tab.id === state.active;
  const title = titleOf(state, tab);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  const noMenu = !menu.close && menu.others.length === 0;
  // Nothing to select against and nothing to do to it.
  const quiet = state.tabs.length === 1 && !closable;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={noMenu || editing}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the chip's controls are the buttons inside; these are pointer gestures on the whole chip */}
        <div
          data-chip={tab.id}
          onPointerDown={editing ? undefined : onDragStart}
          onMouseDown={(event) => {
            // A middle press would otherwise start the browser's autoscroll.
            if (event.button === 1 && closable) event.preventDefault();
          }}
          onAuxClick={(event) => {
            if (event.button !== 1 || !closable || editing) return;
            event.preventDefault();
            onClose();
          }}
          onContextMenu={(event) => {
            if (noMenu) event.preventDefault();
          }}
          className={cn(
            "group relative flex h-7 max-w-[170px] min-w-[100px] shrink touch-none items-center rounded text-[13px] text-muted-foreground",
            !quiet && "hover:bg-muted/60",
            active && !quiet && "bg-muted text-foreground",
            quiet && "text-foreground",
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
              tabIndex={active ? 0 : -1}
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
            <StripTip label="Close" keys={shortcutLabel("alt", "W")}>
              <button
                type="button"
                aria-label={`Close ${title}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={onClose}
                className={cn(
                  "absolute top-1 right-1 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground",
                  active && "opacity-100",
                )}
              >
                <XIcon aria-hidden className="size-3.5" />
              </button>
            </StripTip>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={MENU}>
        <ContextMenuItem className={MENU_ITEM} disabled={!menu.close} onSelect={onClose}>
          <XIcon aria-hidden />
          Close
          <ContextMenuShortcut>{shortcutLabel("alt", "W")}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className={MENU_ITEM}
          disabled={menu.others.length === 0}
          onSelect={() => onCloseMany(menu.others)}
        >
          Close Other Tabs
        </ContextMenuItem>
        {menu.right.length > 0 && (
          <ContextMenuItem className={MENU_ITEM} onSelect={() => onCloseMany(menu.right)}>
            Close Tabs to the Right
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Left, Right, Home and End move focus along the strip without selecting. */
function moveChipFocus(list: HTMLElement, key: string) {
  const chips = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = chips.indexOf(document.activeElement as HTMLElement);
  if (at === -1) return false;
  const last = chips.length - 1;
  const to = {
    ArrowLeft: at === 0 ? last : at - 1,
    ArrowRight: at === last ? 0 : at + 1,
    Home: 0,
    End: last,
  }[key];
  if (to === undefined) return false;
  chips[to].focus();
  return true;
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
  menuOf,
  onActivate,
  onClose,
  onCloseMany,
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
  menuOf: (tab: PanelTab) => TabMenu;
  onActivate: (tab: PanelTab) => void;
  onClose: (tab: PanelTab) => void;
  onCloseMany: (tabs: PanelTab[]) => void;
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
  const [explaining, setExplaining] = useState(false);
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
        onKeyDown={(event) => {
          if (list.current && moveChipFocus(list.current, event.key)) event.preventDefault();
        }}
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
                menu={menuOf(tab)}
                dragged={draggingId === tab.id}
                onActivate={() => onActivate(tab)}
                onClose={() => onClose(tab)}
                onCloseMany={onCloseMany}
                onRename={(title) => onRename(tab, title)}
                onDragStart={(event) => onDragStart(event, tab)}
              />
            </Fragment>
          );
        })}
      </div>
      {canAddStart(state) && (
        <StripTip label="New tab">
          <button type="button" aria-label="New tab" className={STRIP_BUTTON} onClick={onAddStart}>
            <PlusIcon aria-hidden className="size-4" />
          </button>
        </StripTip>
      )}
      <span ref={fill} className="min-w-0 flex-1" />
      <div className="ml-1 flex shrink-0 items-center gap-2">
        <Tooltip delayDuration={500} open={explaining || undefined} onOpenChange={setExplaining}>
          <TooltipTrigger asChild>
            {/* Stays focusable while blocked, so the reason can be read. */}
            <button
              type="button"
              aria-label="Split"
              aria-disabled={reason !== null}
              data-split-control=""
              className={STRIP_BUTTON}
              onClick={() => {
                if (reason === null) onSplit();
                else setExplaining(true);
              }}
            >
              <SquareSplitHorizontalIcon aria-hidden className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {reason ?? "Split"}
            {reason === null && (
              <span className="ml-2 opacity-70">{primaryShortcutLabel("\\")}</span>
            )}
          </TooltipContent>
        </Tooltip>
        {children}
      </div>
    </div>
  );
}
