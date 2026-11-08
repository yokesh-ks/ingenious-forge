import { FolderIcon, FolderOpenIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DirectoryEntry } from "@/api/types";
import { cn } from "@/lib/utils";
import type { WorkspaceTree as Tree, TreeLevel } from "../hooks/use-workspace-tree";
import FileTypeIcon from "./FileTypeIcon";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Folders first, then everything else, each by name. */
function ordered(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.kind === "directory") - Number(a.kind === "directory") ||
      collator.compare(a.name, b.name),
  );
}

const NOTE = "m-0 px-2.5 py-[3px] text-xs text-muted-foreground/70";
const ROW = "flex w-full items-center rounded-md";
const ACTION =
  "flex min-w-0 flex-1 items-center gap-1.5 rounded-md border-0 bg-transparent px-2.5 py-[5px] text-left";
const LABEL = "min-w-0 truncate";

function levelError(level: TreeLevel): string {
  switch (level.error?.status) {
    case 404:
      return "That directory is gone. It may have been moved or deleted.";
    default:
      return `Read failed: ${level.error?.message ?? "unknown error"}`;
  }
}

function Level({
  dir,
  tree,
  current,
  onOpen,
}: {
  dir: string;
  tree: Tree;
  current: string | null;
  onOpen: (path: string) => void;
}) {
  const level = tree.levels[dir];
  if (!level || (level.status === "loading" && level.entries.length === 0)) {
    return <p className={NOTE}>Reading…</p>;
  }
  if (level.status === "failed") {
    return (
      <p role="alert" className={NOTE}>
        {levelError(level)}
      </p>
    );
  }
  if (level.entries.length === 0) return <p className={NOTE}>Empty directory</p>;

  return (
    <>
      <ul className="m-0 list-none p-0 [&_ul]:pl-[18px]">
        {ordered(level.entries).map((entry) => {
          const path = dir ? `${dir}/${entry.name}` : entry.name;
          if (entry.kind === "directory") {
            const expanded = tree.expanded.has(path);
            const Icon = expanded ? FolderOpenIcon : FolderIcon;
            return (
              <li key={entry.name}>
                <div className={cn(ROW, "hover:bg-muted/60")}>
                  <button
                    type="button"
                    className={ACTION}
                    aria-expanded={expanded}
                    onClick={() => tree.toggle(path)}
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
                    <span className={LABEL}>{entry.name}</span>
                  </button>
                </div>
                {expanded && <Level dir={path} tree={tree} current={current} onOpen={onOpen} />}
              </li>
            );
          }
          if (entry.kind === "other") {
            return (
              <li key={entry.name}>
                <div className={ROW} title="Not a file or a directory, so it cannot be opened.">
                  <span className={cn(ACTION, "cursor-default text-muted-foreground/70")}>
                    <FileTypeIcon path={entry.name} />
                    <span className={LABEL}>{entry.name}</span>
                  </span>
                </div>
              </li>
            );
          }
          const isCurrent = path === current;
          return (
            <li key={entry.name}>
              <div className={cn(ROW, isCurrent ? "bg-accent" : "hover:bg-muted/60")}>
                <button
                  type="button"
                  className={ACTION}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => onOpen(path)}
                >
                  <FileTypeIcon path={entry.name} />
                  <span className={LABEL}>{entry.name}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {level.truncated && <p className={NOTE}>Too many entries, showing only some of them.</p>}
    </>
  );
}

/**
 * The project's folders and files, listed one level at a time. The current
 * file's row is marked, and scrolled into view when it first appears.
 */
export default function WorkspaceTree({
  tree,
  current = null,
  onOpen,
}: {
  tree: Tree;
  current?: string | null;
  onOpen: (path: string) => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const scrolledTo = useRef<string | null>(null);
  const { ensureRoot, levels } = tree;

  useEffect(ensureRoot, [ensureRoot]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs as the levels on the way to the file arrive
  useEffect(() => {
    if (!current || scrolledTo.current === current) return;
    const row = body.current?.querySelector("[aria-current]");
    if (!row) return;
    scrolledTo.current = current;
    row.scrollIntoView?.({ block: "nearest" });
  }, [current, levels, tree.expanded]);

  return (
    <div
      ref={body}
      data-workspace-tree=""
      className="mr-0.5 min-h-0 flex-[1_1_auto] overflow-auto py-2 pl-2 text-[13px] leading-[1.5] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
    >
      <Level dir="" tree={tree} current={current} onOpen={onOpen} />
    </div>
  );
}
