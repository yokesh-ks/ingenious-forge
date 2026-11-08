import type { ApprovalDecision } from "@/api/types";
import { Button } from "@/components/ui/button";
import DiffView from "@/features/git/components/DiffView";
import type { Approval } from "@/features/session/session-reducer";
import { cn } from "@/lib/utils";

const ANSWERS: Record<ApprovalDecision, string> = {
  approve: "Approved",
  deny: "Denied",
  always_allow: "Always allowed",
};

/** The approval card: the exact command or diff, and the answer buttons. */
export default function ApprovalPanel({
  approval,
  onAnswer,
}: {
  approval: Approval;
  onAnswer?: (decision: ApprovalDecision) => void;
}) {
  if (approval.status !== "pending") {
    return (
      <p
        className={cn(
          "mb-1.5 text-xs font-medium",
          approval.status === "deny" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {ANSWERS[approval.status]}
      </p>
    );
  }
  const what = approval.kind === "command" ? "Run this command?" : "Apply this edit?";
  return (
    <section
      aria-label="Approval needed"
      className="mb-1.5 flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2"
    >
      <p className="text-xs font-medium">{what}</p>
      {approval.command !== null && (
        <pre className="overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
          {approval.command}
        </pre>
      )}
      {approval.path !== null && (
        <code className="font-mono text-xs text-muted-foreground">{approval.path}</code>
      )}
      {approval.diff !== null && <DiffView diff={approval.diff} />}
      {onAnswer && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onAnswer("approve")}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAnswer("deny")}>
            Deny
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAnswer("always_allow")}>
            Always allow
          </Button>
        </div>
      )}
    </section>
  );
}
