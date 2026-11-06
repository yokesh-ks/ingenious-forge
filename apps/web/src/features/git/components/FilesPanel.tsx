import { RefreshCwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { FileContent, FileList } from "@/api/types";
import { Button } from "@/components/ui/button";
import FileTree from "./FileTree";

/** The project's file tree and a read-only viewer for the chosen file. */
export default function FilesPanel({ projectId }: { projectId: string }) {
  const [list, setList] = useState<FileList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setListError(null);
    api.projectFiles(projectId).then(setList, (err: Error) => setListError(err.message));
  }, [projectId]);

  useEffect(load, [load]);

  if (listError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {listError}
      </p>
    );
  }
  if (!list) return <p className="text-sm text-muted-foreground">Loading files…</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Files</h3>
        <Button size="icon-sm" variant="ghost" aria-label="Refresh files" onClick={load}>
          <RefreshCwIcon />
        </Button>
      </div>
      {list.truncated && (
        <p className="text-xs text-muted-foreground">
          This project is large; not every file is listed. Search to narrow it down.
        </p>
      )}
      {selected ? (
        <FileViewer projectId={projectId} path={selected} onClose={() => setSelected(null)} />
      ) : (
        <FileTree files={list.files} onOpen={setSelected} selected={selected} />
      )}
    </div>
  );
}

function FileViewer({
  projectId,
  path,
  onClose,
}: {
  projectId: string;
  path: string;
  onClose: () => void;
}) {
  const [file, setFile] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    api.projectFile(projectId, path).then(
      (found) => !cancelled && setFile(found),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, path]);

  return (
    <section aria-label={path} className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <code className="truncate font-mono text-xs">{path}</code>
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto"
          aria-label="Close file"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : file ? (
        <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs leading-relaxed">
          {file.content}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}
    </section>
  );
}
