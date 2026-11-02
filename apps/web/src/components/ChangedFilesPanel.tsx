import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/session/session-reducer";
import DiffView from "./DiffView";

interface ChangedFilesPanelProps {
  files: FileChange[];
}

/** The files the agent changed this session, each with its diff. */
export default function ChangedFilesPanel({ files }: ChangedFilesPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const open = files.find((f) => f.path === selected) ?? null;

  return (
    <section aria-labelledby="changed-files-heading" className="flex min-h-0 flex-col gap-3">
      <h2 id="changed-files-heading" className="text-sm font-semibold">
        Changed files ({files.length})
      </h2>
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
