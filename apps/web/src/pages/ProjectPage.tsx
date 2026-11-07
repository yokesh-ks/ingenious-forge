import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { ApprovalMode, SessionModel } from "@/api/types";
import { Button } from "@/components/ui/button";
import GitActions from "@/features/git/components/GitActions";
import { useGitStatus } from "@/features/git/hooks/use-git-status";
import NewSessionForm, { NoProviderPrompt } from "@/features/sandbox/components/NewSessionForm";
import { useModelCatalog } from "@/features/sandbox/hooks/use-model-catalog";
import { useSandbox } from "@/features/sandbox/hooks/use-sandbox";
import SessionHeader from "@/features/session/components/SessionHeader";
import SessionRightSidebar from "@/features/session/components/SessionRightSidebar";
import SessionWorkspace from "@/features/session/components/SessionWorkspace";
import { useProjectSessions } from "@/features/session/hooks/use-project-sessions";
import { useSession } from "@/features/session/hooks/use-session";
import { navigate } from "@/lib/router";

interface ProjectPageProps {
  projectId: string;
  /** The session to show; `null` opens the most recent one. */
  sessionId: string | null;
}

/** The project's open session: header, chat and the workspace panel. */
function SessionPane({
  projectId,
  sessionId,
  model,
  catalog,
  approvalMode,
  onApprovalModeChange,
  savingMode,
  onNewSession,
  creatingNew,
}: {
  projectId: string;
  sessionId: string;
  model: SessionModel | null;
  catalog: ReturnType<typeof useModelCatalog>["catalog"];
  approvalMode: ApprovalMode;
  onApprovalModeChange: (mode: ApprovalMode) => void;
  savingMode: boolean;
  onNewSession: () => void;
  creatingNew: boolean;
}) {
  const git = useGitStatus(projectId);
  const { sandbox } = useSandbox(sessionId);
  const { state, connected, send, stop, revertAll, answerApproval } = useSession(sessionId);

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" disabled={creatingNew} onClick={onNewSession}>
            <PlusIcon /> New session
          </Button>
        </div>
        <SessionHeader
          model={model}
          catalog={catalog}
          approvalMode={approvalMode}
          onApprovalModeChange={onApprovalModeChange}
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
        <SessionWorkspace
          state={state}
          connected={connected}
          onSend={send}
          onStop={stop}
          onAnswerApproval={answerApproval}
        />
      </div>
      <SessionRightSidebar
        projectId={projectId}
        changedFiles={state.changedFiles}
        onRevertAll={revertAll}
        busy={state.running}
      />
    </div>
  );
}

export default function ProjectPage({ projectId, sessionId }: ProjectPageProps) {
  const [error, setError] = useState<string | null>(null);
  const { sessions, error: sessionsError, reload } = useProjectSessions(projectId);
  const [creatingNew, setCreatingNew] = useState(false);
  /** True while the new-session form is shown. */
  const [picking, setPicking] = useState(false);
  const models = useModelCatalog();
  const [savingMode, setSavingMode] = useState(false);
  const active = sessions?.find((s) => s.id === sessionId) ?? null;
  // Guards against creating a second first session when the effect below
  // runs again before the first request returns.
  const creating = useRef(false);
  // A catalog that failed to load counts as known: the server then gives the
  // reason when the session is created.
  const catalogKnown = models.catalog !== null || models.error !== null;
  const noProvider = models.catalog !== null && models.catalog.default === null;

  // With no session chosen, open the most recent one, or start the first.
  useEffect(() => {
    if (sessionId !== null || sessions === null) return;
    const open = (id: string) =>
      navigate(`/projects/${projectId}/sessions/${id}`, { replace: true });
    if (sessions.length > 0) {
      open(sessions[0].id);
      return;
    }
    // Wait to learn whether a first session can start at all.
    if (!catalogKnown || noProvider) return;
    if (creating.current) return;
    creating.current = true;
    api.createSession(projectId).then(
      (created) => {
        reload();
        open(created.id);
      },
      (err: Error) => {
        creating.current = false;
        setError(err.message);
      },
    );
  }, [projectId, sessionId, sessions, reload, catalogKnown, noProvider]);

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
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
      {shownError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {shownError}
        </p>
      )}
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
      ) : !sessionId && noProvider && sessions?.length === 0 ? (
        <div className="flex min-w-0 flex-1 items-start justify-center">
          <NoProviderPrompt />
        </div>
      ) : (
        sessionId && (
          <SessionPane
            key={sessionId}
            projectId={projectId}
            sessionId={sessionId}
            model={active?.model ?? null}
            catalog={models.catalog}
            approvalMode={active?.approval_mode ?? "ask"}
            onApprovalModeChange={changeApprovalMode}
            savingMode={savingMode}
            onNewSession={() => setPicking(true)}
            creatingNew={creatingNew}
          />
        )
      )}
    </div>
  );
}
