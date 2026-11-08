import {
  Maximize2Icon,
  Minimize2Icon,
  MoveIcon,
  PanelLeftIcon,
  PanelRightIcon,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { api } from "@/api/client";
import ResizeHandle from "@/components/layout/ResizeHandle";
import { Button } from "@/components/ui/button";
import ChangedFilesPanel from "@/features/git/components/ChangedFilesPanel";
import { useProject } from "@/features/session/hooks/use-project";
import type { FileChange } from "@/features/session/session-reducer";
import TerminalPanel from "@/features/terminal/components/TerminalPanel";
import { type FileTarget, toProjectPath } from "@/lib/open-file";
import { cn } from "@/lib/utils";
import { type DropTarget, useTabDrag } from "../hooks/use-tab-drag";
import { useWorkspaceTree } from "../hooks/use-workspace-tree";
import {
  activateTab,
  activePaneOf,
  addStartTab,
  canCloseTab,
  closePaneTab,
  dropToSplit,
  focusPane,
  initialLayout,
  moveTab,
  openFileTab,
  openPage,
  type Pane,
  renameTab,
  resolveShells,
  setRatio,
  split,
} from "../model/panes";
import { pickShell } from "../model/shell-choice";
import { type PanelTab, type TabKind, type TabShell, titleOf } from "../model/tabs";
import FilesPage from "./FilesPage";
import FileTab from "./FileTab";
import StartPage from "./StartPage";
import TabStrip, { STRIP_BUTTON } from "./TabStrip";

const WIDTH_MIN = 300;
const WIDTH_MAX_RATIO = 0.7;
const DEFAULT_RATIO = 0.45;
/** The chat keeps at least this much beside the panel. */
const CENTER_MIN = 400;

const firstWidth = () => Math.max(WIDTH_MIN, Math.round(window.innerWidth * DEFAULT_RATIO));

const clampWidth = (width: number, parent: number) =>
  Math.round(
    Math.min(
      Math.max(width, WIDTH_MIN),
      Math.max(WIDTH_MIN, Math.min(parent * WIDTH_MAX_RATIO, parent - CENTER_MIN)),
    ),
  );

/** Lets the page beside the panel open files in it. */
export interface WorkspacePanelControl {
  openFile: (target: FileTarget) => void;
}

/** The hairline between two panes, with a wider place to grab it. */
function PaneDivider({
  ratio,
  grid,
  onRatio,
}: {
  ratio: number;
  grid: RefObject<HTMLDivElement | null>;
  onRatio: (ratio: number) => void;
}) {
  const percent = Math.round(ratio * 100);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter, which <hr> cannot be
    <div
      role="separator"
      aria-label="Resize panes"
      aria-orientation="vertical"
      aria-valuenow={percent}
      aria-valuemin={20}
      aria-valuemax={80}
      tabIndex={0}
      style={{ left: `${percent}%` }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onRatio(ratio + (event.key === "ArrowLeft" ? -0.02 : 0.02));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const onMove = (e: PointerEvent) => {
          const box = grid.current?.getBoundingClientRect();
          if (box && box.width > 0) onRatio((e.clientX - box.left) / box.width);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
      className="absolute inset-y-0 z-[8] w-0 cursor-col-resize touch-none before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-border after:absolute after:inset-y-0 after:-right-1 after:-left-1"
    />
  );
}

/** Where releasing the tab will put it. */
function DropOverlay({ target }: { target: DropTarget }) {
  const zones =
    target.kind === "split"
      ? [
          { id: "left", label: "Add left split", Icon: PanelLeftIcon, hot: target.side === "left" },
          {
            id: "right",
            label: "Add right split",
            Icon: PanelRightIcon,
            hot: target.side === "right",
          },
        ]
      : [{ id: "center", label: "Move here", Icon: MoveIcon, hot: true }];
  return (
    <div className="absolute inset-0 flex bg-background/70 p-2 backdrop-blur-[6px]">
      {zones.map(({ id, label, Icon, hot }, index) => (
        <div key={id} className={cn("flex min-w-0 flex-1", index === 1 && "pl-2")}>
          <div
            data-drop-zone={id}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-[1.5px] border-dashed border-border p-3 text-muted-foreground/70",
              hot && "border-primary bg-primary/10 text-muted-foreground",
            )}
          >
            <Icon aria-hidden className="size-5 flex-none" />
            <span className="max-w-full truncate text-[13px] leading-[1.4] font-medium">
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The session's workspace panel beside the chat: a strip of tabs over
 * Start, Files, Changes and terminals. Every opened tab stays mounted, so
 * a terminal keeps running while another tab or a collapsed panel hides it.
 */
export default function WorkspacePanel({
  projectId,
  changedFiles,
  onRevertAll,
  busy,
  control,
}: {
  projectId: string;
  changedFiles: FileChange[];
  onRevertAll: () => void;
  busy: boolean;
  control?: RefObject<WorkspacePanelControl | null>;
}) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  const [width, setWidth] = useState<number | null>(null);
  const shownWidth = width ?? firstWidth();
  const aside = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  // Each pane keeps its own tree; two panes at most, so two trees.
  const firstTree = useWorkspaceTree(projectId);
  const secondTree = useWorkspaceTree(projectId);
  const trees = [firstTree, secondTree];
  const { project } = useProject(projectId);
  const rootPath = project?.path ?? "";
  // The glow restarts by remounting; each reveal gets a new key.
  const [glow, setGlow] = useState<{ pane: string; serial: number } | null>(null);
  const rooms = useRef<Record<string, boolean>>({});
  const latest = useRef({ open, layout, rootPath });
  latest.current = { open, layout, rootPath };

  const roomIn = (paneId: string) => rooms.current[paneId] ?? true;

  const drag = useTabDrag({
    root: grid,
    paneCount: () => latest.current.layout.panes.length,
    canDropToSplit: () => roomIn(latest.current.layout.panes[0]?.id ?? ""),
    onDrop: (tabId, target) =>
      setLayout((l) => {
        if (target.kind === "split") return dropToSplit(l, tabId, target.side);
        return moveTab(l, tabId, target.pane, target.kind === "strip" ? target.index : undefined);
      }),
  });

  const openPageIn = (
    kind: Exclude<TabKind, "start" | "file">,
    paneId?: string,
    shell?: TabShell,
  ) => {
    setOpen(true);
    setLayout((l) => openPage(l, kind, { paneId, shell }));
  };

  const openFile = useCallback((target: FileTarget, replace = false) => {
    const current = latest.current;
    const path = toProjectPath(target.path, current.rootPath);
    const holder = current.layout.panes.find((pane) => {
      const active = pane.tabs.tabs.find((t) => t.id === pane.tabs.active);
      return active?.kind === "file" && active.path === path;
    });
    if (current.open && holder) {
      setGlow((g) => ({ pane: holder.id, serial: (g?.serial ?? 0) + 1 }));
    }
    setOpen(true);
    setLayout((l) => openFileTab(l, path, { line: target.line, replace }));
  }, []);

  useImperativeHandle(control, () => ({ openFile: (target) => openFile(target) }), [openFile]);

  // Terminals opened without a choice run the remembered shell.
  const waiting = layout.panes.some((pane) =>
    pane.tabs.tabs.some((t) => t.kind === "terminal" && t.shell === undefined),
  );
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    api.terminalShells().then(
      ({ shells }) => live && setLayout((l) => resolveShells(l, pickShell(shells))),
      () => live && setLayout((l) => resolveShells(l, null)),
    );
    return () => {
      live = false;
    };
  }, [waiting]);

  // A pane's tree goes with it; a new pane starts with its tree hidden.
  const usedSlots = layout.panes.map((pane) => pane.slot).join();
  const setFirstShown = firstTree.setShown;
  const setSecondShown = secondTree.setShown;
  useEffect(() => {
    const used = usedSlots.split(",");
    if (!used.includes("0")) setFirstShown(false);
    if (!used.includes("1")) setSecondShown(false);
  }, [usedSlots, setFirstShown, setSecondShown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const primary = e.metaKey || e.ctrlKey;
      const { layout: current } = latest.current;
      const pane = activePaneOf(current);
      const focused = aside.current?.contains(document.activeElement);
      if (e.code === "KeyB" && primary && e.shiftKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.code === "KeyP" && primary && e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen(true);
        if (pane.tabs.tabs.find((t) => t.id === pane.tabs.active)?.kind === "file") {
          // Beside an open file the tree appears there and takes the keyboard.
          (pane.slot === 0 ? setFirstShown : setSecondShown)(true);
          requestAnimationFrame(() => {
            aside.current
              ?.querySelector<HTMLElement>(
                `[data-tab-pane="${pane.id}"]:not([hidden]) [data-workspace-tree] button`,
              )
              ?.focus();
          });
        } else {
          setLayout((l) => openPage(l, "files"));
        }
      } else if (e.code === "Backquote" && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
        setLayout((l) => openPage(l, "terminal"));
      } else if (e.code === "Enter" && primary && e.altKey && focused) {
        e.preventDefault();
        setFullscreen((v) => !v);
      } else if (e.code === "Backslash" && primary && !e.altKey && !e.shiftKey && focused) {
        e.preventDefault();
        if (rooms.current[pane.id] !== false) setLayout((l) => split(l, pane.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFirstShown, setSecondShown]);

  const body = (tab: PanelTab, pane: Pane): ReactNode => {
    const tree = trees[pane.slot];
    switch (tab.kind) {
      case "start":
        return <StartPage onOpen={(kind, shell) => openPageIn(kind, pane.id, shell)} />;
      case "files":
        return (
          <FilesPage
            projectId={projectId}
            rootPath={rootPath}
            tree={tree}
            onOpen={(path) => openFile({ path })}
          />
        );
      case "file": {
        const change = changedFiles.find((f) => f.path === tab.path);
        return (
          <FileTab
            projectId={projectId}
            rootPath={rootPath}
            tab={tab}
            tree={tree}
            active={tab.id === pane.tabs.active}
            changeKey={`${busy}:${change?.diff ?? ""}`}
            onOpenInPlace={(path) => openFile({ path }, true)}
          />
        );
      }
      case "changes":
        return <ChangedFilesPanel files={changedFiles} onRevertAll={onRevertAll} busy={busy} />;
      case "terminal":
        return tab.shell === undefined ? null : (
          <TerminalPanel projectId={projectId} tab={tab.id} shell={tab.shell?.path} />
        );
    }
  };

  const two = layout.panes.length === 2;
  // Kept in a fixed order, so moving a tab between panes never moves its DOM.
  const cells = layout.panes
    .flatMap((pane, index) => pane.tabs.tabs.map((tab) => ({ tab, pane, column: index + 1 })))
    .sort((a, b) => a.tab.id.localeCompare(b.tab.id));
  const lastPane = layout.panes[layout.panes.length - 1];
  const target = drag.target;

  return (
    <>
      {!open && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Open right sidebar"
          title="Open sidebar"
          className="relative z-20 self-start"
          onClick={() => setOpen(true)}
        >
          <PanelRightIcon />
        </Button>
      )}
      {/* Hidden rather than unmounted, so collapsing keeps the terminals. */}
      <aside
        ref={aside}
        aria-label="Workspace panel"
        hidden={!open}
        style={fullscreen ? undefined : { width: shownWidth }}
        className={cn(
          "relative -my-6 -mr-4 min-h-0 min-w-[300px] shrink-0 flex-col border-l bg-background",
          "max-w-[min(70%,calc(100%-400px))]",
          "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:my-0 max-lg:mr-0 max-lg:w-full! max-lg:max-w-[480px]",
          "max-md:fixed max-md:inset-0 max-md:z-40 max-md:max-w-none",
          fullscreen && "fixed inset-0 z-40 m-0 w-full max-w-none",
          open && "flex",
        )}
      >
        {!fullscreen && (
          <ResizeHandle
            label="Resize workspace panel"
            width={shownWidth}
            min={WIDTH_MIN}
            max={Math.round(window.innerWidth * WIDTH_MAX_RATIO)}
            clamp={clampWidth}
            onWidth={setWidth}
          />
        )}
        <div
          ref={grid}
          style={{
            gridTemplateColumns: two
              ? `minmax(0,${layout.ratio}fr) minmax(0,${1 - layout.ratio}fr)`
              : "minmax(0,1fr)",
            gridTemplateRows: "38px minmax(0,1fr)",
          }}
          className="relative grid min-h-0 flex-1"
        >
          {layout.panes.map((pane, index) => (
            <TabStrip
              key={pane.id}
              paneId={pane.id}
              column={index + 1}
              state={pane.tabs}
              paneCount={layout.panes.length}
              draggingId={drag.dragging}
              closable={(tab) => canCloseTab(layout, pane, tab)}
              onActivate={(tab) => {
                if (!drag.consumeDrag()) setLayout((l) => activateTab(l, pane.id, tab.id));
              }}
              onClose={(tab) => {
                setLayout((l) => closePaneTab(l, pane.id, tab.id));
                if (tab.kind === "terminal") {
                  api.closeTerminal(projectId, tab.id).catch((err: Error) => {
                    console.warn("Could not close the terminal", err);
                  });
                }
              }}
              onRename={(tab, title) => setLayout((l) => renameTab(l, tab.id, title))}
              onDragStart={(event, tab) => drag.begin(event, tab.id)}
              onAddStart={() => setLayout((l) => addStartTab(l, pane.id))}
              onSplit={() => setLayout((l) => split(l, pane.id))}
              onRoom={(room) => {
                rooms.current[pane.id] = room;
              }}
            >
              {pane === lastPane && (
                <>
                  <button
                    type="button"
                    aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                    title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                    className={STRIP_BUTTON}
                    onClick={() => setFullscreen((v) => !v)}
                  >
                    {fullscreen ? (
                      <Minimize2Icon aria-hidden className="size-4" />
                    ) : (
                      <Maximize2Icon aria-hidden className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Collapse right sidebar"
                    title="Collapse sidebar"
                    className={STRIP_BUTTON}
                    onClick={() => {
                      setFullscreen(false);
                      setOpen(false);
                    }}
                  >
                    <PanelRightIcon aria-hidden className="size-4" />
                  </button>
                </>
              )}
            </TabStrip>
          ))}
          {cells.map(({ tab, pane, column }) => {
            const shown = tab.id === pane.tabs.active;
            return (
              <div
                key={tab.id}
                role="tabpanel"
                aria-label={titleOf(pane.tabs, tab)}
                data-tab-pane={pane.id}
                hidden={!shown}
                style={{ gridColumn: column, gridRow: 2 }}
                onPointerDownCapture={() => setLayout((l) => focusPane(l, pane.id))}
                className={cn(
                  "min-h-0 min-w-0 flex-col",
                  shown && "flex",
                  tab.kind === "file" || tab.kind === "files"
                    ? "overflow-hidden"
                    : "overflow-y-auto",
                  tab.kind === "changes" && "p-3",
                  tab.kind === "terminal" && "mt-2 overflow-hidden p-2",
                )}
              >
                {body(tab, pane)}
              </div>
            );
          })}
          {layout.panes.map((pane, index) => (
            <div
              key={pane.id}
              data-pane-body={pane.id}
              style={{ gridColumn: index + 1, gridRow: 2 }}
              className="pointer-events-none relative z-[7]"
            >
              {glow?.pane === pane.id && (
                <span
                  key={glow.serial}
                  aria-hidden
                  className="absolute inset-0 animate-[panel-glow_0.6s_ease-in-out]"
                />
              )}
              {target && target.kind !== "strip" && target.pane === pane.id && (
                <DropOverlay target={target} />
              )}
            </div>
          ))}
          {two && (
            <PaneDivider
              ratio={layout.ratio}
              grid={grid}
              onRatio={(ratio) => setLayout((l) => setRatio(l, ratio))}
            />
          )}
          {target?.kind === "strip" && (
            <span
              aria-hidden
              data-drop-caret=""
              style={{ left: target.caretX - 1, top: 14 }}
              className="pointer-events-none absolute z-[8] h-5 w-0.5 bg-primary"
            />
          )}
        </div>
      </aside>
    </>
  );
}
