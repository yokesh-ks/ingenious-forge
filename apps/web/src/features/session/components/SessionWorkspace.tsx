import { useState } from "react";
import ChangedFilesPanel from "@/features/git/components/ChangedFilesPanel";
import FilesPanel from "@/features/git/components/FilesPanel";
import { useSession } from "@/features/session/hooks/use-session";
import TerminalPanel from "@/features/terminal/components/TerminalPanel";
import { cn } from "@/lib/utils";
import Composer from "./Composer";
import SessionView from "./SessionView";

type PanelTab = "changes" | "files" | "terminal";

/** One session: the conversation, the composer and the workspace panel. */
export default function SessionWorkspace({
  sessionId,
  projectId,
}: {
  sessionId: string;
  /** Shows the project's files beside the session when given. */
  projectId?: string;
}) {
  const [tab, setTab] = useState<PanelTab>("changes");
  const [terminalOpened, setTerminalOpened] = useState(false);
  const { state, connected, send, stop, revertAll, answerApproval } = useSession(sessionId);

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {!connected && (
          <p role="status" className="text-center text-xs text-muted-foreground">
            Connecting to the Forge server…
          </p>
        )}
        <div className="flex min-h-0 flex-1">
          <SessionView
            messages={state.messages}
            running={state.running}
            error={state.error}
            onAnswerApproval={answerApproval}
          />
        </div>
        <Composer onSend={send} busy={state.running} onStop={stop} focusOnMount />
      </div>
      <aside className="hidden w-96 shrink-0 overflow-y-auto border-l pl-4 lg:flex lg:flex-col">
        {projectId && (
          <div role="tablist" aria-label="Workspace panel" className="mb-3 flex gap-1 border-b">
            {(["changes", "files", "terminal"] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                className={cn(
                  "-mb-px border-b-2 px-2 py-1 text-sm capitalize",
                  tab === name
                    ? "border-primary font-medium"
                    : "border-transparent text-muted-foreground",
                )}
                onClick={() => {
                  setTab(name);
                  if (name === "terminal") setTerminalOpened(true);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {/* The terminal stays mounted once opened, so switching tabs keeps it. */}
        {projectId && terminalOpened && (
          <div className={tab === "terminal" ? "flex min-h-0 flex-1" : "hidden"}>
            <TerminalPanel projectId={projectId} />
          </div>
        )}
        {tab === "terminal" ? null : projectId && tab === "files" ? (
          <FilesPanel projectId={projectId} />
        ) : (
          <ChangedFilesPanel
            files={state.changedFiles}
            onRevertAll={revertAll}
            busy={state.running}
          />
        )}
      </aside>
    </div>
  );
}
