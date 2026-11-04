import type { ModelCatalog, SessionModel } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { describeModel } from "@/lib/models";

interface SessionHeaderProps {
  model: SessionModel | null;
  catalog: ModelCatalog | null;
}

/** The model and reasoning effort the session was started with. */
export default function SessionHeader({ model, catalog }: SessionHeaderProps) {
  if (!model) return null;
  const names = describeModel(model, catalog);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls
    <div role="group" aria-label="Session settings" className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" title={names.provider}>
        {names.model}
      </Badge>
      <Badge variant="outline">{names.effort} effort</Badge>
    </div>
  );
}
