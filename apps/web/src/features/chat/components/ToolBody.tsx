import type { ApprovalDecision, QuestionAnswer } from "@/api/types";
import type { ToolItem } from "@/features/session/session-reducer";
import { toolKind } from "@/features/session/tool-names";
import ApprovalPanel from "./cards/ApprovalPanel";
import BashCard from "./cards/BashCard";
import { CARD, InspectButton } from "./cards/card-shell";
import EditCard from "./cards/EditCard";
import QuestionPanel from "./cards/QuestionPanel";
import ReadCard from "./cards/ReadCard";
import TodoList from "./cards/TodoList";

/**
 * What an opened tool row shows: the approval card while one waits, the
 * question card, or the call's own card (terminal, file, diff, plan or
 * text), with Inspect under it.
 */
export default function ToolBody({
  tool,
  onAnswerApproval,
  onAnswerQuestion,
}: {
  tool: ToolItem;
  onAnswerApproval?: (callId: string, decision: ApprovalDecision) => void;
  onAnswerQuestion?: (callId: string, answers: QuestionAnswer[]) => void;
}) {
  if (tool.question) {
    return (
      <QuestionPanel
        card={tool.question}
        onSubmit={onAnswerQuestion && ((answers) => onAnswerQuestion(tool.callId, answers))}
      />
    );
  }
  const waiting = tool.approval?.status === "pending";
  return (
    <div className="flex flex-col gap-1">
      {tool.approval && (
        <ApprovalPanel
          approval={tool.approval}
          onAnswer={onAnswerApproval && ((decision) => onAnswerApproval(tool.callId, decision))}
        />
      )}
      {!waiting && (
        <>
          <Card tool={tool} />
          <InspectButton />
        </>
      )}
    </div>
  );
}

function Card({ tool }: { tool: ToolItem }) {
  const kind = toolKind(tool.name);
  if (kind === "bash") return <BashCard tool={tool} />;
  if (tool.status === "running" || tool.output === null) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Running…
      </p>
    );
  }
  if (tool.status === "error") {
    return (
      <p data-testid="tool-output" className="text-xs whitespace-pre-wrap text-destructive">
        {tool.output}
      </p>
    );
  }
  if (kind === "read") return <ReadCard tool={tool} />;
  if (kind === "edit" || kind === "write") return <EditCard tool={tool} />;
  if (kind === "plan" && tool.todos) return <TodoList todos={tool.todos} />;
  return (
    <pre
      data-testid="tool-output"
      className={`${CARD} max-h-56 overflow-auto px-4 py-3 font-mono text-[11px] leading-4 whitespace-pre-wrap`}
    >
      {tool.output}
    </pre>
  );
}
