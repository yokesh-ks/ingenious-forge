import type { ApprovalDecision } from "@/api/types";
import type { SessionState } from "@/features/session/session-reducer";
import Composer from "./Composer";
import SessionView from "./SessionView";

interface SessionWorkspaceProps {
  state: SessionState;
  connected: boolean;
  onSend: (text: string) => boolean;
  onStop: () => void;
  onAnswerApproval: (callId: string, decision: ApprovalDecision) => void;
}

/** One session: the conversation and the composer. */
export default function SessionWorkspace({
  state,
  connected,
  onSend,
  onStop,
  onAnswerApproval,
}: SessionWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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
          onAnswerApproval={onAnswerApproval}
        />
      </div>
      <Composer onSend={onSend} busy={state.running} onStop={onStop} focusOnMount />
    </div>
  );
}
