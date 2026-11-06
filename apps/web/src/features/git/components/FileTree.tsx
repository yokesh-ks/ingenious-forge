import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { buildTree, filterFiles, type TreeNode } from "@/lib/file-tree";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  files: string[];
  onOpen: (path: string) => void;
  /** The file open in the viewer. */
  selected?: string | null;
}

/** Shown at most while searching, so typing stays fast in big projects. */
const MAX_MATCHES = 200;

const rowClass =
  "flex w-full items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-left text-sm hover:bg-muted";

/** The project's files: collapsible folders, or matches while searching. */
export default function FileTree({ files, onOpen, selected = null }: FileTreeProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(files), [files]);
  const matches = useMemo(() => filterFiles(files, query), [files, query]);
  const searching = query.trim() !== "";

  function toggle(path: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNodes(nodes: TreeNode[], depth: number) {
    return nodes.map((node) => {
      const pad = { paddingLeft: `${depth * 0.75 + 0.375}rem` };
      if (node.children) {
        const expanded = open.has(node.path);
        return (
          <li key={node.path}>
            <button
              type="button"
              className={rowClass}
              style={pad}
              aria-expanded={expanded}
              onClick={() => toggle(node.path)}
            >
              <ChevronRightIcon
                aria-hidden
                className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
              />
              <FolderIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{node.name}</span>
            </button>
            {expanded && <ul>{renderNodes(node.children, depth + 1)}</ul>}
          </li>
        );
      }
      return (
        <li key={node.path}>
          <button
            type="button"
            className={cn(rowClass, node.path === selected && "bg-muted font-medium")}
            style={{ paddingLeft: `${depth * 0.75 + 1.375}rem` }}
            aria-current={node.path === selected ? "true" : undefined}
            onClick={() => onOpen(node.path)}
          >
            <FileIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </button>
        </li>
      );
    });
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Input
        type="search"
        aria-label="Search files"
        placeholder="Search files…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files in this project.</p>
      ) : searching ? (
        matches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No files match “{query.trim()}”.</p>
        ) : (
          <ul className="overflow-y-auto">
            {matches.slice(0, MAX_MATCHES).map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className={cn(rowClass, path === selected && "bg-muted font-medium")}
                  aria-current={path === selected ? "true" : undefined}
                  onClick={() => onOpen(path)}
                >
                  <FileIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs">{path}</span>
                </button>
              </li>
            ))}
            {matches.length > MAX_MATCHES && (
              <li className="px-1.5 text-xs text-muted-foreground">
                … {matches.length - MAX_MATCHES} more matches
              </li>
            )}
          </ul>
        )
      ) : (
        <ul className="overflow-y-auto">{renderNodes(tree, 0)}</ul>
      )}
    </div>
  );
}
