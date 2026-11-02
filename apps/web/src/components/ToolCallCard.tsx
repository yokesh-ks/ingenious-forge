import { FileTextIcon, FolderOpenIcon, PencilIcon, WrenchIcon } from "lucide-react";
import type { JsonValue } from "@/api/types";
import { cn } from "@/lib/utils";
import type { ToolItem } from "@/session/session-reducer";

const PREVIEW_LINES = 12;

const TOOLS: Record<string, { label: string; icon: typeof FileTextIcon }> = {
  read_file: { label: "Read", icon: FileTextIcon },
  edit_file: { label: "Edit", icon: PencilIcon },
  list_directory: { label: "List", icon: FolderOpenIcon },
};

function pathArg(args: JsonValue): string | null {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const path = args.path;
    if (typeof path === "string" && path !== "") return path;
  }
  return null;
}

function ReadPreview({ output }: { output: string }) {
  const lines = output.split("\n");
  const hidden = lines.length - PREVIEW_LINES;
  return (
    <>
      <pre data-testid="tool-output" className="overflow-x-auto font-mono text-xs leading-relaxed">
        {lines.slice(0, PREVIEW_LINES).join("\n")}
      </pre>
      {hidden > 0 && <p className="mt-1 text-xs text-muted-foreground">… {hidden} more lines</p>}
    </>
  );
}

function Listing({ output }: { output: string }) {
  return (
    <ul data-testid="tool-output" className="font-mono text-xs leading-relaxed">
      {output.split("\n").map((entry) => (
        <li key={entry}>{entry}</li>
      ))}
    </ul>
  );
}

function ToolOutput({ tool }: { tool: ToolItem }) {
  if (tool.status === "running" || tool.output === null) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Running…
      </p>
    );
  }
  if (tool.status === "error") {
    return (
      <p data-testid="tool-output" className="text-xs text-destructive">
        {tool.output}
      </p>
    );
  }
  if (tool.name === "read_file") return <ReadPreview output={tool.output} />;
  if (tool.name === "list_directory") return <Listing output={tool.output} />;
  return (
    <p data-testid="tool-output" className="text-xs whitespace-pre-wrap">
      {tool.output}
    </p>
  );
}

/** One tool call and its result, shown inline in the session. */
export default function ToolCallCard({ tool }: { tool: ToolItem }) {
  const known = TOOLS[tool.name];
  const Icon = known?.icon ?? WrenchIcon;
  const path = pathArg(tool.args) ?? (tool.name === "list_directory" ? "." : null);

  return (
    <article
      aria-label={`${known?.label ?? tool.name} tool call`}
      className={cn(
        "w-full rounded-lg border bg-card px-3 py-2 text-card-foreground",
        tool.status === "error" && "border-destructive/40",
      )}
    >
      <header className="mb-1.5 flex items-center gap-2 text-sm">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">{known?.label ?? tool.name}</span>
        {path && <code className="truncate font-mono text-xs text-muted-foreground">{path}</code>}
        {tool.status === "error" && (
          <span className="ml-auto text-xs font-medium text-destructive">Failed</span>
        )}
      </header>
      <ToolOutput tool={tool} />
    </article>
  );
}
