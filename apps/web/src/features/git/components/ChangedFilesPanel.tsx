import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FileChange } from "@/features/session/session-reducer";
import { cn } from "@/lib/utils";
import DiffView from "./DiffView";

interface ChangedFilesPanelProps {
  files: FileChange[];
  /** Restores every changed file; offered only when given. */
  onRevertAll?: () => void;
  /** True while a turn runs; reverting waits until it ends. */
  busy?: boolean;
}

/** The files the agent changed this session, each with its diff. */
export default function ChangedFilesPanel({
  files,
  onRevertAll,
  busy = false,
}: ChangedFilesPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const open = files.find((f) => f.path === selected) ?? null;

  return (
    <section aria-labelledby="changed-files-heading" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="changed-files-heading" className="flex-1 text-sm font-semibold">
          Changed files ({files.length})
        </h2>
        {onRevertAll && files.length > 0 && !confirming && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
            Revert all
          </Button>
        )}
        {onRevertAll && files.length > 0 && confirming && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onRevertAll();
              }}
            >
              Confirm revert
            </Button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No changes yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {files.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                aria-pressed={file.path === open?.path}
                onClick={() => setSelected(file.path === open?.path ? null : file.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                  file.path === open?.path && "bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                <span className="text-green-700 dark:text-green-400">+{file.additions}</span>
                <span className="text-red-700 dark:text-red-400">−{file.deletions}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="min-h-0 overflow-auto">
          <DiffView diff={open.diff} />
        </div>
      )}
    </section>
  );
}
