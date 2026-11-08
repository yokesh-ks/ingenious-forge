import { ChevronDownIcon, ChevronUpIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { type ChatTurn, formatDuration } from "../model/build-chat";

/** The line under a user message that says how a finished turn went, and
 * folds its process groups away once it completed. */
export default function TurnControl({
  turn,
  folded,
  onToggle,
}: {
  turn: ChatTurn;
  folded: boolean;
  onToggle: () => void;
}) {
  const text = "font-mono text-xs tabular-nums text-muted-foreground";
  // A running turn shows its status below its rows instead.
  if (turn.status === "running") return null;
  if (turn.status === "failed" || turn.status === "stopped") {
    return (
      <p className={cn(text, turn.status === "failed" && "text-destructive")}>
        {turn.status === "failed" ? "Failed" : "Stopped"}
      </p>
    );
  }
  const label =
    turn.durationMs !== null ? `Completed in ${formatDuration(turn.durationMs)}` : "Completed";
  if (!turn.collapsible) return <p className={text}>{label}</p>;
  const Chevron = folded ? ChevronDownIcon : ChevronUpIcon;
  return (
    <button
      type="button"
      aria-expanded={!folded}
      onClick={onToggle}
      className={cn(text, "flex w-fit items-center gap-1 rounded hover:text-foreground")}
    >
      {label}
      <Chevron aria-hidden className="size-3.5" />
    </button>
  );
}

/** The line under a running turn's rows: how long it has been working. */
export function RunningStatus({ startedAt }: { startedAt: number | null }) {
  const now = useNow();
  return (
    <p role="status" className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
      <SparklesIcon aria-hidden className="size-3.5" />
      Deep diving
      {startedAt !== null && ` for ${formatDuration(Math.max(0, now - startedAt))}`}
      <span aria-hidden className="animate-pulse">
        ···
      </span>
    </p>
  );
}

/** The current time, ticking each second. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
