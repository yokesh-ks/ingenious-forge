import type { ReactNode } from "react";
import type { ApprovalDecision, QuestionAnswer } from "@/api/types";
import type { SessionState } from "@/features/session/session-reducer";
import Composer from "./Composer";
import SessionView from "./SessionView";

interface SessionWorkspaceProps {
  state: SessionState;
  connected: boolean;
  onSend: (text: string) => boolean;
  onStop: () => void;
  onAnswerApproval: (callId: string, decision: ApprovalDecision) => void;
  onAnswerQuestion?: (callId: string, answers: QuestionAnswer[]) => void;
  /** Whether older events exist that are not loaded yet. */
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  /** A row directly above the composer, as wide as it is. */
  composerBar?: ReactNode;
  /** Controls at the left of the composer's bottom row. */
  startControls?: ReactNode;
  /** Controls at the right of the composer's bottom row. */
  endControls?: ReactNode;
}

/** One session: the conversation and the composer. */
export default function SessionWorkspace({
  state,
  connected,
  onSend,
  onStop,
  onAnswerApproval,
  onAnswerQuestion,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  composerBar,
  startControls,
  endControls,
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
          turns={state.turns}
          running={state.running}
          error={state.error}
          onAnswerApproval={onAnswerApproval}
          onAnswerQuestion={onAnswerQuestion}
          hasOlder={hasOlder}
          loadingOlder={loadingOlder}
          onLoadOlder={onLoadOlder}
        />
      </div>
      <div className="flex flex-col gap-2">
        {composerBar && <div className="mx-auto w-full max-w-3xl">{composerBar}</div>}
        <Composer
          onSend={onSend}
          busy={state.running}
          onStop={onStop}
          focusOnMount
          startControls={startControls}
          endControls={endControls}
        />
      </div>
    </div>
  );
}
