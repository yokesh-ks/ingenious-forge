import {
  ArrowRightToLineIcon,
  FolderIcon,
  FolderOpenIcon,
  RefreshCwIcon,
  WrapTextIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiRequestError, api } from "@/api/client";
import ResizeHandle from "@/components/layout/ResizeHandle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WorkspaceTree as Tree } from "../hooks/use-workspace-tree";
import {
  clampNavigator,
  type FileFailure,
  failureLine,
  failureRecourse,
  fileFailure,
  isUnviewable,
  NAVIGATOR_DEFAULT,
  navigatorLayout,
  type ViewerId,
  viewersFor,
} from "../model/file-preview";
import type { PanelTab } from "../model/tabs";
import DocumentLoading from "./DocumentLoading";
import FileTypeIcon from "./FileTypeIcon";
import FontNotice from "./FontNotice";
import {
  BytesViewer,
  CodeViewer,
  HtmlViewer,
  ImageViewer,
  MarkdownViewer,
  TextViewer,
} from "./file-viewers";
import OpenTarget from "./OpenTarget";
import { PaneHeader, PathLabel, ToolButton } from "./pane-parts";
import WorkspaceTree from "./WorkspaceTree";

/** The file's text, read when the tab opens and again on `reload` or when
 * `changeKey` moves. Reading again keeps the old text on screen. */
function useFileText(projectId: string, path: string, skip: boolean, changeKey: string) {
  const [content, setContent] = useState<string | null>(null);
  const [failure, setFailure] = useState<FileFailure | null>(null);
  const [loading, setLoading] = useState(!skip);
  const request = useRef(0);

  const read = useCallback(() => {
    if (skip) return;
    const id = ++request.current;
    setLoading(true);
    api.projectFile(projectId, path).then(
      (file) => {
        if (id !== request.current) return;
        setContent(file.content);
        setFailure(null);
        setLoading(false);
      },
      (err: Error) => {
        if (id !== request.current) return;
        setFailure(fileFailure(err instanceof ApiRequestError ? err.status : 0, err.message));
        setLoading(false);
      },
    );
  }, [projectId, path, skip]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new path starts empty
  useEffect(() => {
    setContent(null);
    setFailure(null);
  }, [path]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: changeKey asks for a fresh read
  useEffect(read, [read, changeKey]);

  return { content, failure, loading, read };
}

/** The content row's width and the window's, kept current. */
function useRowWidths() {
  const ref = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState({ row: 0, viewport: window.innerWidth });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setWidths({ row: element.getBoundingClientRect().width, viewport: window.innerWidth });
    measure();
    window.addEventListener("resize", measure);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { ref, ...widths };
}

/** Scrolls to a line a link named and marks it, once per request. */
function useLineReveal(
  body: React.RefObject<HTMLDivElement | null>,
  tab: PanelTab,
  ready: boolean,
  viewer: ViewerId,
) {
  const answered = useRef(0);
  useEffect(() => {
    const revision = tab.revision ?? 0;
    if (!ready || answered.current === revision) return;
    answered.current = revision;
    if (!tab.line || viewer === "markdown") return;
    const row = body.current?.querySelector<HTMLElement>(`[data-line="${tab.line}"]`);
    if (!row) return;
    for (const old of body.current?.querySelectorAll("[data-line-mark]") ?? []) {
      old.removeAttribute("data-line-mark");
    }
    row.scrollIntoView?.({ block: "center" });
    row.setAttribute("data-line-mark", "");
  }, [body, tab.line, tab.revision, ready, viewer]);
}

function StatusIcon({ path }: { path: string }) {
  return <FileTypeIcon path={path} className="size-9 opacity-60 grayscale" />;
}

/** How often the tab on screen looks for a change to its file. */
const AUTO_REFRESH_MS = 2000;

const EMPTY =
  "flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-[13px] leading-[1.6] text-muted-foreground after:shrink after:basis-[12%] after:content-['']";

/** One open file: its path and controls over the file, with the project
 * tree beside it when shown. */
export default function FileTab({
  projectId,
  rootPath,
  tab,
  tree,
  active,
  changeKey,
  onOpenInPlace,
}: {
  projectId: string;
  rootPath: string;
  tab: PanelTab;
  tree: Tree;
  active: boolean;
  /** Moves when the file may have changed. */
  changeKey: string;
  onOpenInPlace: (path: string) => void;
}) {
  const path = tab.path ?? "";
  const unviewable = isUnviewable(path);
  const viewers = viewersFor(path);
  const [choice, setChoice] = useState<{ path: string; id: ViewerId } | null>(null);
  const selected = viewers.find((v) => choice?.path === path && v.id === choice.id) ?? viewers[0];
  const { content, failure, loading, read } = useFileText(
    projectId,
    path,
    unviewable || selected.bytes === true,
    changeKey,
  );
  const [revisit, setRevisit] = useState(0);
  const rawUrl = `${api.rawFileUrl(projectId, path)}&v=${revisit}`;
  const officeUrl = `${api.officePdfUrl(projectId, path)}&v=${revisit}`;
  const [missingFonts, setMissingFonts] = useState<string[]>([]);
  const fileName = path.split("/").pop() ?? path;
  const reload = () => {
    setRevisit((value) => value + 1);
    read();
  };
  const [wrap, setWrap] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const measured = useRowWidths();
  const layout = navigatorLayout(measured.row, measured.viewport);
  const fullPath = path.startsWith("/") ? path : `${rootPath.replace(/\/+$/, "")}/${path}`;

  useLineReveal(body, tab, content !== null, selected.id);

  const canAutoRefresh = !unviewable && selected.bytes !== true;
  useEffect(() => {
    if (!active || !canAutoRefresh) return;
    const timer = window.setInterval(read, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, canAutoRefresh, read]);

  const { shown, reveal, setShown } = tree;
  useEffect(() => {
    if (shown && active && path) reveal(path);
  }, [shown, active, path, reveal]);

  // A tree that covers the file gets out of the way of a file just opened.
  const revision = tab.revision ?? 0;
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    if (active && layout === "fill") setShown(false);
  }, [revision, active, layout, setShown]);

  const treeWidth = clampNavigator(tree.width ?? NAVIGATOR_DEFAULT, measured.row || 1200, layout);

  const unchanged = content !== null;
  const navigator = shown && (
    <div
      style={layout === "fill" ? undefined : { width: treeWidth }}
      className={cn(
        "flex min-h-0 min-w-0 flex-col bg-background",
        layout === "fill" && "absolute inset-0 z-[2]",
        layout !== "fill" &&
          "relative flex-none rounded-lg bg-popover shadow-lg ring-[0.5px] ring-border",
        layout === "push" && "m-2 self-stretch",
        layout === "overlay" && "absolute top-2 right-2 bottom-2 z-[2]",
      )}
    >
      {layout !== "fill" && (
        <ResizeHandle
          label="Resize file tree"
          width={treeWidth}
          min={180}
          max={Math.max(180, measured.row - (layout === "push" ? 336 : 120))}
          clamp={(width, parent) => clampNavigator(width, parent, layout)}
          onWidth={tree.setWidth}
        />
      )}
      <WorkspaceTree tree={tree} current={path} onOpen={onOpenInPlace} />
    </div>
  );

  let main: React.ReactNode;
  if (unviewable) {
    main = (
      <div className={EMPTY}>
        <StatusIcon path={path} />
        <p className="m-0">Preview is not available for this file type yet.</p>
        <OpenTarget projectId={projectId} path={path} prominent />
      </div>
    );
  } else if (selected.id === "image") {
    main = <ImageViewer key={rawUrl} src={rawUrl} name={fileName} />;
  } else if (selected.id === "pdf" || selected.id === "sheet" || selected.id === "office") {
    main = (
      <BytesViewer
        key={path}
        viewer={selected.id}
        url={selected.id === "office" ? officeUrl : rawUrl}
        path={path}
        onFonts={setMissingFonts}
        onRetry={reload}
      />
    );
  } else if (content !== null) {
    main =
      selected.id === "markdown" ? (
        <MarkdownViewer path={path} content={content} />
      ) : selected.id === "html" ? (
        <HtmlViewer projectId={projectId} path={path} content={content} name={fileName} />
      ) : selected.id === "code" ? (
        <CodeViewer path={path} content={content} wrap={wrap} />
      ) : (
        <TextViewer content={content} wrap={wrap} />
      );
  } else if (failure) {
    const recourse = failureRecourse(failure);
    main = (
      <div className={EMPTY}>
        <StatusIcon path={path} />
        <p className="m-0">{failureLine(failure)}</p>
        {recourse === "open" && <OpenTarget projectId={projectId} path={path} prominent />}
        {recourse === "retry" && (
          <button
            type="button"
            onClick={read}
            className="inline-flex h-8 flex-none items-center gap-1.5 rounded-lg border-[0.5px] border-border pr-3.5 pl-3 text-[13px] text-foreground hover:bg-muted"
          >
            <RefreshCwIcon aria-hidden className="size-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  } else {
    main = loading ? <DocumentLoading /> : null;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-[1_1_auto] flex-col">
      {unchanged && failure && (
        <p className="m-0 flex flex-none items-center gap-2.5 border-b border-border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span>{failureLine(failure)}</span>
          <button
            type="button"
            onClick={read}
            className="rounded border-[0.5px] border-border bg-background px-2.5 py-1 text-[13px] text-foreground hover:bg-muted"
          >
            Reload
          </button>
        </p>
      )}
      <PaneHeader>
        <PathLabel path={fullPath} />
        {!unviewable && viewers.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open with"
                title={selected.title}
                className="inline-flex h-7 max-w-40 flex-none items-center justify-center truncate rounded px-1.5 text-xs whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {selected.title}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[136px]">
              <DropdownMenuRadioGroup
                value={selected.id}
                onValueChange={(id) => setChoice({ path, id: id as ViewerId })}
              >
                {viewers.map((viewer) => (
                  <DropdownMenuRadioItem key={viewer.id} value={viewer.id} className="py-[5px]">
                    {viewer.title}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {selected.id === "office" && <FontNotice fonts={missingFonts} />}
        {!unviewable && selected.wrap && (
          <ToolButton
            aria-label="Line wrap"
            aria-pressed={wrap}
            title={wrap ? "Turn off line wrap" : "Turn on line wrap"}
            onClick={() => setWrap((value) => !value)}
          >
            {wrap ? <ArrowRightToLineIcon aria-hidden /> : <WrapTextIcon aria-hidden />}
          </ToolButton>
        )}
        {!unviewable && (
          <ToolButton aria-label="Read the file again" title="Read the file again" onClick={reload}>
            <RefreshCwIcon aria-hidden />
          </ToolButton>
        )}
        <OpenTarget projectId={projectId} path={path} />
        <ToolButton
          ref={toggleButton}
          aria-label={shown ? "Hide file tree" : "Show file tree"}
          title={shown ? "Hide file tree" : "Show file tree"}
          aria-expanded={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? <FolderOpenIcon aria-hidden /> : <FolderIcon aria-hidden />}
        </ToolButton>
      </PaneHeader>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape from the file or the tree inside */}
      <div
        ref={measured.ref}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented || !shown) return;
          if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
          setShown(false);
          toggleButton.current?.focus();
        }}
        className="relative isolate flex min-h-0 min-w-0 flex-[1_1_auto]"
      >
        <div
          ref={body}
          onAnimationEnd={(event) =>
            (event.target as HTMLElement).removeAttribute("data-line-mark")
          }
          className={cn(
            "isolate min-h-0 min-w-0 flex-[1_1_auto]",
            shown && layout === "fill" && "invisible",
          )}
        >
          {main}
        </div>
        {navigator}
      </div>
    </div>
  );
}
