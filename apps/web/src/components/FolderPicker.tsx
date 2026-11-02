import { ArrowUpIcon, FolderGit2Icon, FolderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { DirListing } from "@/api/types";
import { Button } from "@/components/ui/button";

interface FolderPickerProps {
  onPick: (path: string) => void;
  onCancel: () => void;
}

/** Browses folders on the server's disk to choose a git repository. */
export default function FolderPicker({ onPick, onCancel }: FolderPickerProps) {
  // `undefined` asks the server for its starting folder (home).
  const [path, setPath] = useState<string | undefined>(undefined);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.listDirs(path).then(
      (result) => !cancelled && setListing(result),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <section aria-label="Choose a folder" className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="Up one folder"
          disabled={!listing?.parent}
          onClick={() => listing?.parent && setPath(listing.parent)}
        >
          <ArrowUpIcon />
        </Button>
        <code className="min-w-0 flex-1 truncate text-xs">{listing?.path ?? "…"}</code>
        {listing?.is_git_repo && (
          <Button size="sm" onClick={() => onPick(listing.path)}>
            Open this folder
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {listing && listing.entries.length === 0 && (
        <p className="text-xs text-muted-foreground">No folders here.</p>
      )}
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {listing?.entries.map((entry) => (
          <li key={entry.path} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPath(entry.path)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
            >
              {entry.is_git_repo ? (
                <FolderGit2Icon className="size-4 text-primary" aria-hidden />
              ) : (
                <FolderIcon className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.is_git_repo && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Open ${entry.name}`}
                onClick={() => onPick(entry.path)}
              >
                Open
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
