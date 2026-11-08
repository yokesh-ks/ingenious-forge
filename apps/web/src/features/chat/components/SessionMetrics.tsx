import { DatabaseIcon, GaugeIcon } from "lucide-react";
import { useSessionStats } from "@/features/stats/hooks/use-session-stats";
import {
  cacheHitPercent,
  contextPercent,
  formatTokens,
  formatTps,
  totalTokens,
} from "../model/format";

/**
 * The line under the composer: turns and steps with output speed, tokens
 * with the cache hit, and how much of the context the last request used.
 * Totals come from the server's fold of the whole log, reloaded whenever
 * `refreshKey` changes (a step settles or a turn ends).
 */
export default function SessionMetrics({
  sessionId,
  refreshKey,
}: {
  sessionId: string;
  refreshKey: string;
}) {
  const stats = useSessionStats(sessionId, refreshKey);

  if (!stats || stats.steps === 0) return null;
  const speed =
    stats.decode_ms > 0
      ? `${formatTps(stats.decode_tokens / (stats.decode_ms / 1000))} tok/s`
      : null;
  const total = totalTokens(stats.usage);
  const hit = cacheHitPercent(stats.usage);
  const context = contextPercent(stats.last_context_tokens, stats.context_window);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply form controls
    <div
      role="group"
      aria-label="Session metrics"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums"
    >
      <span className="flex items-center gap-1">
        <GaugeIcon aria-hidden className="size-3.5" />
        {`${stats.turns} turns ${stats.steps} steps`}
        {speed && ` · ${speed}`}
      </span>
      {total > 0 && (
        <span className="flex items-center gap-1">
          <DatabaseIcon aria-hidden className="size-3.5" />
          {`${formatTokens(total)} tok`}
          {hit !== null && ` · Cache hit ${hit}%`}
        </span>
      )}
      {context !== null && (
        <span className="flex items-center gap-1">
          <meter
            className="sr-only"
            aria-label={`${context}% of context used`}
            value={context}
            min={0}
            max={100}
          />
          <ContextRing percent={context} />
          <span aria-hidden>{context}%</span>
        </span>
      )}
    </div>
  );
}

/** A small ring filled to `percent`. */
function ContextRing({ percent }: { percent: number }) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 -rotate-90">
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth="2"
      />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={`${(Math.min(percent, 100) / 100) * circumference} ${circumference}`}
      />
    </svg>
  );
}
