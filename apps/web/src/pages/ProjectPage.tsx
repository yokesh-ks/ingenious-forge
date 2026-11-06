import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { ApprovalMode, Project, SessionModel } from "@/api/types";
import GitActions from "@/features/git/components/GitActions";
import { useGitStatus } from "@/features/git/hooks/use-git-status";
import NewSessionForm from "@/features/sandbox/components/NewSessionForm";
import { useModelCatalog } from "@/features/sandbox/hooks/use-model-catalog";
import { useSandbox } from "@/features/sandbox/hooks/use-sandbox";
import SessionHeader from "@/features/session/components/SessionHeader";
import SessionSidebar from "@/features/session/components/SessionSidebar";
import SessionWorkspace from "@/features/session/components/SessionWorkspace";
import { useProjectSessions } from "@/features/session/hooks/use-project-sessions";
import { Link, navigate } from "@/lib/router";

interface ProjectPageProps {
  projectId: string;
  /** The session to show; `null` opens the most recent one. */
  sessionId: string | null;
}

export default function ProjectPage({ projectId, sessionId }: ProjectPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { sessions, error: sessionsError, reload } = useProjectSessions(projectId);
  const [creatingNew, setCreatingNew] = useState(false);
  /** True while the new-session form is shown. */
  const [picking, setPicking] = useState(false);
  const models = useModelCatalog();
  const git = useGitStatus(projectId);
  const { sandbox } = useSandbox(sessionId);
  const [savingMode, setSavingMode] = useState(false);
  const active = sessions?.find((s) => s.id === sessionId) ?? null;
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

  async function newSession(model: SessionModel) {
    setCreatingNew(true);
    setError(null);
    try {
      const created = await api.createSession(projectId, model);
      setPicking(false);
      reload();
      navigate(`/projects/${projectId}/sessions/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingNew(false);
    }
  }

  async function changeApprovalMode(mode: ApprovalMode) {
    if (!sessionId) return;
    setSavingMode(true);
    setError(null);
    try {
      await api.setApprovalMode(sessionId, mode);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingMode(false);
    }
  }

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
          <SessionSidebar
            projectId={projectId}
            sessions={sessions}
            activeId={sessionId}
            onNewSession={() => setPicking(true)}
            creating={creatingNew}
          />
        </aside>
        {picking ? (
          <div className="flex min-w-0 flex-1 items-start justify-center">
            <NewSessionForm
              catalog={models.catalog}
              error={models.error}
              onStart={newSession}
              onCancel={() => setPicking(false)}
              starting={creatingNew}
            />
          </div>
        ) : (
          sessionId && (
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <SessionHeader
                model={active?.model ?? null}
                catalog={models.catalog}
                approvalMode={active?.approval_mode ?? "ask"}
                onApprovalModeChange={changeApprovalMode}
                savingMode={savingMode}
                git={git.status}
                sandbox={sandbox}
                actions={
                  git.status && (
                    <GitActions
                      projectId={projectId}
                      sessionId={sessionId}
                      status={git.status}
                      onChanged={git.reload}
                    />
                  )
                }
              />
              <SessionWorkspace key={sessionId} sessionId={sessionId} projectId={projectId} />
            </div>
          )
        )}
      </div>
    </div>
  );
}
