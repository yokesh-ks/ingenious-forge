import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import SessionWorkspace from "@/components/SessionWorkspace";
import { Link } from "@/lib/router";

export default function ProjectPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setSessionId(null);
    setError(null);
    (async () => {
      try {
        const found = await api.getProject(projectId);
        if (cancelled) return;
        setProject(found);
        const session = await api.createSession(projectId);
        if (!cancelled) setSessionId(session.id);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden /> All projects
        </Link>
        {project && (
          <>
            <h2 className="text-lg font-semibold">{project.name}</h2>
            <code className="truncate text-xs text-muted-foreground">{project.path}</code>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {sessionId && <SessionWorkspace sessionId={sessionId} />}
    </div>
  );
}
