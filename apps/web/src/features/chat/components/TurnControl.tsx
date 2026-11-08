import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { type ChatTurn, formatDuration, formatElapsed } from "../model/build-chat";

/** The line under a user message that says how the turn went, and folds
 * its process groups away once it completed. */
export default function TurnControl({
  turn,
  folded,
  onToggle,
}: {
  turn: ChatTurn;
  folded: boolean;
  onToggle: () => void;
}) {
  const running = turn.status === "running";
  const now = useNow(running);
  const text = "font-mono text-xs tabular-nums text-muted-foreground";

  if (running) {
    return (
      <p role="status" className={text}>
        Working
        {turn.startedAt !== null && ` ${formatElapsed(now - turn.startedAt)}`}
        <span aria-hidden className="ml-1 animate-pulse">
          ···
        </span>
      </p>
    );
  }
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

/** The current time, ticking each second while `live`. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}
