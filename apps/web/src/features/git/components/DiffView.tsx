import { cn } from "@/lib/utils";

type LineKind = "header" | "hunk" | "added" | "removed" | "context" | "meta";

function kindOf(line: string): LineKind {
  if (line.startsWith("+++ ") || line.startsWith("--- ")) return "header";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  if (line.startsWith("\\")) return "meta";
  return "context";
}

const STYLES: Record<LineKind, string> = {
  header: "text-muted-foreground font-semibold",
  hunk: "text-sky-700 dark:text-sky-400 bg-sky-500/10",
  added: "text-green-800 dark:text-green-300 bg-green-500/15",
  removed: "text-red-800 dark:text-red-300 bg-red-500/15",
  context: "text-foreground",
  meta: "text-muted-foreground italic",
};

/** A unified diff, one row per line, added lines green and removed red. */
export default function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) {
    return <p className="text-xs text-muted-foreground">No changes.</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-md border font-mono text-xs leading-relaxed">
      {lines.map((line, index) => {
        const kind = kindOf(line);
        return (
          <div
            // Diff lines repeat, so position is the only stable key.
            // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity
            key={index}
            data-testid="diff-line"
            data-kind={kind}
            className={cn("px-2 whitespace-pre", STYLES[kind])}
          >
            {line}
          </div>
        );
      })}
    </pre>
  );
}
