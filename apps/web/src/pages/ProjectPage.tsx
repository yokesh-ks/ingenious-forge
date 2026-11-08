import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { ApprovalMode, SessionModel } from "@/api/types";
import SessionMetrics from "@/features/chat/components/SessionMetrics";
import GitBadge from "@/features/git/components/GitBadge";
import { useGitStatus } from "@/features/git/hooks/use-git-status";
import ApprovalModePicker from "@/features/sandbox/components/ApprovalModePicker";
import ModelPicker from "@/features/sandbox/components/ModelPicker";
import { NoProviderPrompt } from "@/features/sandbox/components/NewSessionForm";
import SandboxBadge from "@/features/sandbox/components/SandboxBadge";
import { useModelCatalog } from "@/features/sandbox/hooks/use-model-catalog";
import { useSandbox } from "@/features/sandbox/hooks/use-sandbox";
import ProjectPicker from "@/features/session/components/ProjectPicker";
import SessionTabs from "@/features/session/components/SessionTabs";
import SessionWorkspace from "@/features/session/components/SessionWorkspace";
import { useProjectSessions } from "@/features/session/hooks/use-project-sessions";
import { useSession } from "@/features/session/hooks/use-session";
import type { TurnRecord } from "@/features/session/session-reducer";
import StatisticsView from "@/features/stats/components/StatisticsView";
import TrajectoryView from "@/features/trajectory/components/TrajectoryView";
import WorkspacePanel, {
  type WorkspacePanelControl,
} from "@/features/workspace-panel/components/WorkspacePanel";
import { type FileTarget, OpenFileContext } from "@/lib/open-file";
import { navigate } from "@/lib/router";

/** Changes whenever a step settles or a turn starts or ends, so the
 * metrics reload then and not on every streamed chunk. */
function metricsKey(turns: TurnRecord[]): string {
  const last = turns[turns.length - 1];
  return last ? `${turns.length}:${last.status}:${last.steps}` : "0";
}

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
  onModelChange,
  savingModel,
}: {
  projectId: string;
  sessionId: string;
  model: SessionModel | null;
  catalog: ReturnType<typeof useModelCatalog>["catalog"];
  approvalMode: ApprovalMode;
  onApprovalModeChange: (mode: ApprovalMode) => void;
  savingMode: boolean;
  onModelChange: (model: SessionModel) => void;
  savingModel: boolean;
}) {
  const git = useGitStatus(projectId);
  const { sandbox } = useSandbox(sessionId);
  const {
    state,
    events,
    connected,
    loaded,
    hasOlder,
    loadingOlder,
    loadOlder,
    send,
    stop,
    revertAll,
    answerApproval,
    answerQuestion,
  } = useSession(sessionId);
  const panel = useRef<WorkspacePanelControl>(null);
  const openFile = useCallback((target: FileTarget) => panel.current?.openFile(target), []);

  return (
    <OpenFileContext.Provider value={openFile}>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <SandboxBadge sandbox={sandbox} />
          <SessionWorkspace
            state={state}
            connected={connected}
            onSend={send}
            onStop={stop}
            onAnswerApproval={answerApproval}
            onAnswerQuestion={answerQuestion}
            hasOlder={hasOlder}
            loadingOlder={loadingOlder}
            onLoadOlder={loadOlder}
            footer={<SessionMetrics sessionId={sessionId} refreshKey={metricsKey(state.turns)} />}
            frame={(chat) => (
              <SessionTabs
                chat={chat}
                trajectory={
                  <TrajectoryView
                    events={events}
                    loaded={loaded}
                    hasOlder={hasOlder}
                    loadingOlder={loadingOlder}
                    onLoadOlder={loadOlder}
                  />
                }
                statistics={
                  <StatisticsView
                    sessionId={sessionId}
                    refreshKey={metricsKey(state.turns)}
                    events={events}
                    hasOlder={hasOlder}
                    loadingOlder={loadingOlder}
                    onLoadOlder={loadOlder}
                  />
                }
              />
            )}
            composerBar={
              <div className="flex items-center justify-between gap-2">
                <ProjectPicker projectId={projectId} />
                <GitBadge status={git.status} />
              </div>
            }
            startControls={
              <ApprovalModePicker
                mode={approvalMode}
                onChange={onApprovalModeChange}
                saving={savingMode}
              />
            }
            endControls={
              <ModelPicker
                model={model}
                catalog={catalog}
                onChange={onModelChange}
                disabled={savingModel || state.running}
              />
            }
          />
        </div>
        <WorkspacePanel
          projectId={projectId}
          changedFiles={state.changedFiles}
          onRevertAll={revertAll}
          busy={state.running}
          control={panel}
        />
      </div>
    </OpenFileContext.Provider>
  );
}

export default function ProjectPage({ projectId, sessionId }: ProjectPageProps) {
  const [error, setError] = useState<string | null>(null);
  const { sessions, error: sessionsError, reload } = useProjectSessions(projectId);
  const models = useModelCatalog();
  const [savingMode, setSavingMode] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
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

  async function changeModel(model: SessionModel) {
    if (!sessionId) return;
    setSavingModel(true);
    setError(null);
    try {
      await api.setSessionModel(sessionId, model);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingModel(false);
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
      {!sessionId && noProvider && sessions?.length === 0 ? (
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
            onModelChange={changeModel}
            savingModel={savingModel}
          />
        )
      )}
    </div>
  );
}
