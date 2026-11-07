import { ShieldAlertIcon, ShieldOffIcon } from "lucide-react";
import type { SandboxInfo } from "@/api/types";

/** Warns when the session's commands are not sandboxed; a working sandbox shows nothing. */
export default function SandboxBadge({ sandbox }: { sandbox: SandboxInfo | null }) {
  if (!sandbox) return null;
  if (sandbox.problem) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls
      <div
        role="group"
        aria-label="Sandbox"
        className="flex items-center gap-1.5 text-xs text-destructive"
      >
        <ShieldAlertIcon aria-hidden className="size-3.5" />
        <span>Sandbox unavailable: {sandbox.problem}</span>
      </div>
    );
  }
  if (!sandbox.active) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls
      <div
        role="group"
        aria-label="Sandbox"
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <ShieldOffIcon aria-hidden className="size-3.5" />
        <span>Commands are not sandboxed</span>
      </div>
    );
  }
  return null;
}
