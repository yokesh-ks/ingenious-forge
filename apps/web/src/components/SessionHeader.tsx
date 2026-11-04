import type { ApprovalMode, ModelCatalog, SessionModel } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { describeModel } from "@/lib/models";
import ApprovalModePicker from "./ApprovalModePicker";

interface SessionHeaderProps {
  model: SessionModel | null;
  catalog: ModelCatalog | null;
  approvalMode: ApprovalMode;
  onApprovalModeChange: (mode: ApprovalMode) => void;
  /** True while an approval mode change is being saved. */
  savingMode?: boolean;
}

/** The session's model, reasoning effort and approval mode. */
export default function SessionHeader({
  model,
  catalog,
  approvalMode,
  onApprovalModeChange,
  savingMode = false,
}: SessionHeaderProps) {
  const names = model ? describeModel(model, catalog) : null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls
    <div role="group" aria-label="Session settings" className="flex flex-wrap items-center gap-2">
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
  );
}
