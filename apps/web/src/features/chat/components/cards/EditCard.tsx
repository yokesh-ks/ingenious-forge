import DiffView from "@/features/git/components/DiffView";
import type { ToolItem } from "@/features/session/session-reducer";
import { baseName, CARD, field } from "./card-shell";

/** An edit or write: the file name, its line counts and the diff this call
 * made. Sessions logged before calls carried their diff show the summary. */
export default function EditCard({ tool }: { tool: ToolItem }) {
  const meta = tool.meta ?? undefined;
  const diff = field(meta, "diff");
  if (!diff) {
    return (
      <p data-testid="tool-output" className="text-xs whitespace-pre-wrap">
        {tool.output}
      </p>
    );
  }
  const path = field(meta, "path") ?? field(tool.args, "file_path") ?? "";
  const counts = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  return (
    <figure aria-label={baseName(path)} className={CARD}>
      <figcaption className="flex items-center gap-2 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="truncate">{baseName(path)}</span>
        <span className="text-green-700 dark:text-green-400">+{String(counts.additions ?? 0)}</span>
        <span className="text-red-700 dark:text-red-400">−{String(counts.deletions ?? 0)}</span>
      </figcaption>
      <div className="max-h-72 overflow-auto px-2 pb-2">
        <DiffView diff={diff} />
      </div>
    </figure>
  );
}
