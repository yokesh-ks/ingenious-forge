import type { ReactNode } from "react";
import type { ApprovalMode, GitStatus, ModelCatalog, SessionModel } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { describeModel } from "@/lib/models";
import ApprovalModePicker from "./ApprovalModePicker";
import GitBadge from "./GitBadge";

interface SessionHeaderProps {
  model: SessionModel | null;
  catalog: ModelCatalog | null;
  approvalMode: ApprovalMode;
  onApprovalModeChange: (mode: ApprovalMode) => void;
  /** True while an approval mode change is being saved. */
  savingMode?: boolean;
  git?: GitStatus | null;
  /** Git actions shown under the header. */
  actions?: ReactNode;
}

/** The session's model, reasoning effort and approval mode. */
export default function SessionHeader({
  model,
  catalog,
  approvalMode,
  onApprovalModeChange,
  savingMode = false,
  git = null,
  actions,
}: SessionHeaderProps) {
  const names = model ? describeModel(model, catalog) : null;
  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls */}
      <div role="group" aria-label="Session settings" className="flex flex-wrap items-center gap-2">
        <GitBadge status={git} />
        {names && (
          <>
            <Badge variant="outline" title={names.provider}>
              {names.model}
            </Badge>
            <Badge variant="outline">{names.effort} effort</Badge>
          </>
        )}
        <div className="ml-auto">
          <ApprovalModePicker
            mode={approvalMode}
            onChange={onApprovalModeChange}
            saving={savingMode}
          />
        </div>
      </div>
      {actions}
    </div>
  );
}
