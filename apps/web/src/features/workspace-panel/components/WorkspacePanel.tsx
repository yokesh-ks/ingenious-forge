import {
  CompassIcon,
  FolderIcon,
  GitCompareArrowsIcon,
  type LucideIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelRightIcon,
  PlusIcon,
  SquareSplitHorizontalIcon,
  SquareTerminalIcon,
  XIcon,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import ResizeHandle from "@/components/layout/ResizeHandle";
import { Button } from "@/components/ui/button";
import ChangedFilesPanel from "@/features/git/components/ChangedFilesPanel";
import FilesPanel from "@/features/git/components/FilesPanel";
import type { FileChange } from "@/features/session/session-reducer";
import TerminalPanel from "@/features/terminal/components/TerminalPanel";
import { cn } from "@/lib/utils";
import {
  activate,
  addStart,
  canAddStart,
  canClose,
  closeTab,
  initialTabs,
  openTab,
  type PanelTab,
  type PanelTabs,
  type TabKind,
  titleOf,
} from "../model/tabs";
import StartPage from "./StartPage";

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

const ICONS: Record<TabKind, LucideIcon> = {
  start: CompassIcon,
  files: FolderIcon,
  changes: GitCompareArrowsIcon,
  terminal: SquareTerminalIcon,
};

const STRIP_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

/** The title fades out over the 16px before the close button. Written out
 * in full so Tailwind can find the classes. */
const FADE_UNDER_CLOSE =
  "group-focus-within:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))] group-hover:[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))]";
const ACTIVE_FADE =
  "[mask-image:linear-gradient(to_right,black_calc(100%-30px),transparent_calc(100%-14px))]";

/** One tab in the strip; its close button shows while active or hovered. */
function Chip({
  state,
  tab,
  onActivate,
  onClose,
}: {
  state: PanelTabs;
  tab: PanelTab;
  onActivate: () => void;
  onClose: () => void;
}) {
  const active = tab.id === state.active;
  const title = titleOf(state, tab);
  const Icon = ICONS[tab.kind];
  const closable = canClose(state, tab);
  return (
    <div
      className={cn(
        "group relative flex h-7 max-w-[170px] min-w-[100px] shrink items-center rounded text-[13px] text-muted-foreground hover:bg-muted/60",
        active && "bg-muted text-foreground",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={title}
        onClick={onActivate}
        className="flex h-full min-w-0 flex-1 items-center px-2.5"
      >
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-[5px] overflow-hidden whitespace-nowrap",
            closable && FADE_UNDER_CLOSE,
            closable && active && ACTIVE_FADE,
          )}
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          {title}
        </span>
      </button>
      {closable && (
        <button
          type="button"
          aria-label={`Close ${title}`}
          title="Close"
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
}: {
  projectId: string;
  changedFiles: FileChange[];
  onRevertAll: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [state, setState] = useState(() => initialTabs());
  const [width, setWidth] = useState<number | null>(null);
  const shownWidth = width ?? firstWidth();
  const aside = useRef<HTMLElement>(null);

  const openPage = (kind: Exclude<TabKind, "start">) => {
    setOpen(true);
    setState((s) => openTab(s, kind));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const primary = e.metaKey || e.ctrlKey;
      if (e.code === "KeyB" && primary && e.shiftKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.code === "KeyP" && primary && e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen(true);
        setState((s) => openTab(s, "files"));
      } else if (e.code === "Backquote" && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
        setState((s) => openTab(s, "terminal"));
      } else if (
        e.code === "Enter" &&
        primary &&
        e.altKey &&
        aside.current?.contains(document.activeElement)
      ) {
        e.preventDefault();
        setFullscreen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const body = (tab: PanelTab): ReactNode => {
    switch (tab.kind) {
      case "start":
        return <StartPage onOpen={openPage} />;
      case "files":
        return <FilesPanel projectId={projectId} />;
      case "changes":
        return <ChangedFilesPanel files={changedFiles} onRevertAll={onRevertAll} busy={busy} />;
      case "terminal":
        return <TerminalPanel projectId={projectId} tab={tab.id} />;
    }
  };

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
        <div className="flex h-[38px] shrink-0 items-center gap-1 pt-2.5 pr-1.5 pl-2.5">
          <div
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
                    <span
                      aria-hidden
                      className="flex h-7 w-2.5 shrink-0 items-center justify-center"
                    >
                      <span className={cn("h-3.5 w-px bg-border", blank && "bg-transparent")} />
                    </span>
                  )}
                  <Chip
                    state={state}
                    tab={tab}
                    onActivate={() => setState((s) => activate(s, tab.id))}
                    onClose={() => {
                      setState((s) => closeTab(s, tab.id));
                      if (tab.kind === "terminal") {
                        api.closeTerminal(projectId, tab.id).catch((err: Error) => {
                          console.warn("Could not close the terminal", err);
                        });
                      }
                    }}
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
              onClick={() => setState(addStart)}
            >
              <PlusIcon aria-hidden className="size-4" />
            </button>
          )}
          <span className="min-w-0 flex-1" />
          <div className="ml-1 flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Split"
              title="Split is not available yet"
              disabled
              className={STRIP_BUTTON}
            >
              <SquareSplitHorizontalIcon aria-hidden className="size-4" />
            </button>
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
          </div>
        </div>
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            aria-label={titleOf(state, tab)}
            hidden={tab.id !== state.active}
            className={cn(
              "min-h-0 flex-1 flex-col overflow-y-auto",
              tab.id === state.active && "flex",
              tab.kind !== "start" && "p-3",
            )}
          >
            {body(tab)}
          </div>
        ))}
      </aside>
    </>
  );
}
