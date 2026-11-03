import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import SessionSidebar from "@/components/SessionSidebar";
import SessionWorkspace from "@/components/SessionWorkspace";
import { Link, navigate } from "@/lib/router";
import { useProjectSessions } from "@/session/use-project-sessions";

interface ProjectPageProps {
  projectId: string;
  /** The session to show; `null` opens the most recent one. */
  sessionId: string | null;
}

export default function ProjectPage({ projectId, sessionId }: ProjectPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { sessions, error: sessionsError } = useProjectSessions(projectId);
  // Guards against creating a second first session when the effect below
  // runs again before the first request returns.
  const creating = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.getProject(projectId).then(
      (found) => !cancelled && setProject(found),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // With no session chosen, open the most recent one, or start the first.
  useEffect(() => {
    if (sessionId !== null || sessions === null) return;
    const open = (id: string) =>
      navigate(`/projects/${projectId}/sessions/${id}`, { replace: true });
    if (sessions.length > 0) {
      open(sessions[0].id);
      return;
    }
    if (creating.current) return;
    creating.current = true;
    api.createSession(projectId).then(
      (created) => open(created.id),
      (err: Error) => {
        creating.current = false;
        setError(err.message);
      },
    );
  }, [projectId, sessionId, sessions]);

  const shownError = error ?? sessionsError;

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
      {shownError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {shownError}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r pr-4 md:block">
          <SessionSidebar projectId={projectId} sessions={sessions} activeId={sessionId} />
        </aside>
        {sessionId && <SessionWorkspace key={sessionId} sessionId={sessionId} />}
      </div>
    </div>
  );
}
