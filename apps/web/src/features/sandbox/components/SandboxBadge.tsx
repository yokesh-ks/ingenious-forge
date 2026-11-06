import { ShieldAlertIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import type { SandboxInfo } from "@/api/types";
import { Badge } from "@/components/ui/badge";

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/** Which sandbox the session's commands run in and where they may write. */
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
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls
    <div role="group" aria-label="Sandbox" className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge variant="outline">
        <ShieldCheckIcon aria-hidden />
        {sandbox.name}
      </Badge>
      <span className="text-muted-foreground">writes to</span>
      {sandbox.writable.map((path) => (
        <code key={path} title={path} className="rounded bg-muted px-1 font-mono">
          {folderName(path)}
        </code>
      ))}
      <span className="text-muted-foreground">
        · {sandbox.network ? "network allowed" : "no network"}
      </span>
    </div>
  );
}
