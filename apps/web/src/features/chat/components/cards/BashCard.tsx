import { useCopy } from "@/components/markdown/code-tools";
import type { ToolItem } from "@/features/session/session-reducer";
import { cn } from "@/lib/utils";
import { baseName, CARD, field } from "./card-shell";

/**
 * A shell command as a terminal card: a status dot, the folder it ran in,
 * the command and Copy, then its output, streamed while it runs.
 */
export default function BashCard({ tool }: { tool: ToolItem }) {
  const command = field(tool.args, "command") ?? "";
  const cwd = field(tool.meta ?? undefined, "cwd");
  const { copied, copy } = useCopy(command);
  const failed = tool.status === "error" || (tool.exitCode !== null && tool.exitCode !== 0);
  const state = tool.status === "running" ? "Running" : failed ? "Failed" : "Done";

  return (
    <div className={cn(CARD, "font-mono text-[11px] leading-4")}>
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            state === "Running" && "animate-pulse bg-muted-foreground/50",
            state === "Done" && "bg-green-500",
            state === "Failed" && "bg-red-500",
          )}
        />
        <span data-testid="run-state" className="sr-only">
          {state}
        </span>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {cwd && <span className="shrink-0 text-muted-foreground">{baseName(cwd)}</span>}
          <span data-testid="shell-command" className="truncate">
            {command}
          </span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 font-sans text-[13px] text-muted-foreground hover:text-foreground"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Output tool={tool} failed={failed} />
    </div>
  );
}

function Output({ tool, failed }: { tool: ToolItem; failed: boolean }) {
  // A command that could not start has no lines, only the reason.
  if (tool.status === "error" && tool.lines.length === 0) {
    return <p className="px-3.5 pb-3 pl-[30px] text-destructive">{tool.output}</p>;
  }
  return (
    <div className="max-h-56 overflow-auto px-3.5 pb-3 pl-[30px]">
      {tool.hiddenLines > 0 && (
        <p className="mb-1 text-muted-foreground">… {tool.hiddenLines} earlier lines not shown</p>
      )}
      {tool.lines.length > 0 ? (
        <div data-testid="shell-output" className="whitespace-pre">
          {tool.lines.map((line, i) => (
            <div
              // Lines only append, so their position is stable.
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
              key={i}
              data-stream={line.stream}
              className={cn(line.stream === "stderr" && "text-amber-600 dark:text-amber-400")}
            >
              {line.text}
            </div>
          ))}
        </div>
      ) : (
        tool.status !== "running" && <p className="text-muted-foreground">(no output)</p>
      )}
      {failed && tool.exitCode !== null && tool.exitCode !== 0 && (
        <p className="mt-1 font-medium text-destructive">Exit code {tool.exitCode}</p>
      )}
    </div>
  );
}
