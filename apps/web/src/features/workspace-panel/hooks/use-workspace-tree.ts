import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, api } from "@/api/client";
import type { DirectoryEntry, DirectoryListing } from "@/api/types";

/** One folder's entries. Reloading keeps the old ones on screen. */
export interface TreeLevel {
  status: "loading" | "ready" | "failed";
  entries: DirectoryEntry[];
  truncated: boolean;
  /** Set when `status` is `failed`. */
  error?: { status: number; message: string };
}

export interface WorkspaceTree {
  levels: Record<string, TreeLevel>;
  expanded: ReadonlySet<string>;
  /** Whether the tree shows beside the files in this panel. */
  shown: boolean;
  setShown: (shown: boolean) => void;
  /** The tree's chosen width; `null` until the user resizes it. */
  width: number | null;
  setWidth: (width: number | null) => void;
  ensureRoot: () => void;
  toggle: (dir: string) => void;
  reload: () => void;
  /** Opens the folders leading to `path`, once per file. */
  reveal: (path: string) => void;
}

/** The panel's one file tree: its files page and every file tab show it, so
 * folders stay open as tabs change. Folders are listed as they are opened. */
export function useWorkspaceTree(projectId: string): WorkspaceTree {
  const [levels, setLevels] = useState<Record<string, TreeLevel>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [shown, setShown] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const known = useRef<Record<string, DirectoryListing>>({});
  const pending = useRef(new Map<string, Promise<DirectoryListing | null>>());
  const revealed = useRef<string | null>(null);

  const list = useCallback(
    (dir: string) => {
      const running = pending.current.get(dir);
      if (running) return running;
      setLevels((all) => ({
        ...all,
        [dir]: {
          entries: all[dir]?.entries ?? [],
          truncated: all[dir]?.truncated ?? false,
          status: all[dir]?.status === "ready" ? "ready" : "loading",
        },
      }));
      const request = api
        .projectDirectory(projectId, dir)
        .then(
          (listing) => {
            known.current[dir] = listing;
            setLevels((all) => ({ ...all, [dir]: { ...listing, status: "ready" } }));
            return listing;
          },
          (err: Error) => {
            delete known.current[dir];
            const status = err instanceof ApiRequestError ? err.status : 0;
            setLevels((all) => ({
              ...all,
              [dir]: {
                entries: [],
                truncated: false,
                status: "failed",
                error: { status, message: err.message },
              },
            }));
            return null;
          },
        )
        .finally(() => pending.current.delete(dir));
      pending.current.set(dir, request);
      return request;
    },
    [projectId],
  );

  const ensure = useCallback(
    (dir: string) => {
      const listing = known.current[dir];
      return listing ? Promise.resolve(listing) : list(dir);
    },
    [list],
  );

  const ensureRoot = useCallback(() => void ensure(""), [ensure]);

  const toggle = useCallback(
    (dir: string) => {
      const opening = !expanded.has(dir);
      setExpanded((current) => {
        const next = new Set(current);
        if (opening) next.add(dir);
        else next.delete(dir);
        return next;
      });
      // Reopening lists again, so a folder never shows stale entries.
      if (opening) void list(dir);
    },
    [expanded, list],
  );

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const reload = useCallback(() => {
    void list("");
    for (const dir of expandedRef.current) void list(dir);
  }, [list]);

  const reveal = useCallback(
    async (path: string) => {
      if (revealed.current === path) return;
      revealed.current = path;
      const parts = path.split("/");
      let dir = "";
      for (const name of parts.slice(0, -1)) {
        const listing = await ensure(dir);
        if (revealed.current !== path) return;
        if (!listing?.entries.some((e) => e.name === name && e.kind === "directory")) return;
        dir = dir ? `${dir}/${name}` : name;
        const opened = dir;
        setExpanded((current) => (current.has(opened) ? current : new Set(current).add(opened)));
      }
      await ensure(dir);
    },
    [ensure],
  );

  // Coming back into view lists again what the tree shows.
  useEffect(() => {
    if (shown) reload();
  }, [shown, reload]);

  return useMemo(
    () => ({
      levels,
      expanded,
      shown,
      setShown,
      width,
      setWidth,
      ensureRoot,
      toggle,
      reload,
      reveal: (path: string) => void reveal(path),
    }),
    [levels, expanded, shown, width, ensureRoot, toggle, reload, reveal],
  );
}
