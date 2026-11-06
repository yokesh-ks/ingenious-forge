import { GitBranchIcon } from "lucide-react";
import type { GitStatus } from "@/api/types";
import { Badge } from "@/components/ui/badge";

/** The project's branch and how many files have changes. */
export default function GitBadge({ status }: { status: GitStatus | null }) {
  if (!status) return null;
  const counts = [
    status.staged > 0 && `${status.staged} staged`,
    status.changed > 0 && `${status.changed} changed`,
  ].filter(Boolean);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls
    <div role="group" aria-label="Git status" className="flex items-center gap-1.5">
      <Badge variant="outline" className="max-w-48">
        <GitBranchIcon aria-hidden />
        <span className="truncate">
          {status.detached ? `detached at ${status.branch ?? "?"}` : (status.branch ?? "unknown")}
        </span>
      </Badge>
      <span className="text-xs text-muted-foreground">
        {counts.length > 0 ? counts.join(" · ") : "No changes"}
      </span>
    </div>
  );
}
