import { cn } from "@/lib/utils";
import type { RecordKind } from "../model/build-trajectory";

const TONES: Record<RecordKind, string> = {
  system: "bg-muted text-muted-foreground",
  user: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  context: "bg-green-500/10 text-green-700 dark:text-green-300",
  assistant: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  tool: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

/** A record's kind as a small upper-case tag, coloured by kind. */
export default function KindBadge({ kind }: { kind: RecordKind }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center rounded-[3px] px-1.5 text-[10px] font-semibold tracking-wide",
        TONES[kind],
      )}
    >
      {kind.toUpperCase()}
    </span>
  );
}
