import { useSession } from "@/session/use-session";
import ChangedFilesPanel from "./ChangedFilesPanel";
import Composer from "./Composer";
import SessionView from "./SessionView";

/** One session: the conversation, the composer and the changed files. */
export default function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const { state, send, stop, revertAll } = useSession(sessionId);

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-1">
          <SessionView messages={state.messages} running={state.running} error={state.error} />
        </div>
        <Composer onSend={send} busy={state.running} onStop={stop} focusOnMount />
      </div>
      <aside className="hidden w-96 shrink-0 overflow-y-auto border-l pl-4 lg:flex lg:flex-col">
        <ChangedFilesPanel
          files={state.changedFiles}
          onRevertAll={revertAll}
          busy={state.running}
        />
      </aside>
    </div>
  );
}
