import { useMemo, useState } from "react";
import type { SessionEnvelope, SessionStats } from "@/api/types";
import { useCopy } from "@/components/markdown/code-tools";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useSessionStats } from "../hooks/use-session-stats";
import {
  buildStats,
  cacheHit,
  contextTokens,
  type EventStat,
  formatChars,
  formatClockMs,
  formatKTokens,
  formatMs,
  type StepStat,
  stepTiming,
  type Timing,
  type ToolStat,
  type TurnStat,
  turnTotals,
} from "../model/build-stats";

type Basis = "latest" | "cumulative";

const COLUMNS: { label: string; hint: string }[] = [
  {
    label: "Turn / step",
    hint: "A turn row holds the turn total; click a row to expand or collapse its steps",
  },
  { label: "Trigger", hint: "What opened this turn: the user's message" },
  {
    label: "Execution",
    hint: "Tools this step called and how often; a step without tool calls previews its answer text",
  },
  { label: "Context", hint: "usage input tokens + cache read + cache write" },
  { label: "Output", hint: "usage output tokens of the step" },
  {
    label: "Cache hit",
    hint: "cache read ÷ (input + cache read + cache write): the share of the prompt served from cache",
  },
  { label: "First token", hint: "step start to the first output fragment (TTFT)" },
  { label: "Model time", hint: "step start to the settled reply (includes the first-token delay)" },
  { label: "Output speed", hint: "output tokens ÷ generation seconds (tok/s)" },
  {
    label: "Tool time",
    hint: "sum of every tool call up to its result inside the step; calls without a result are excluded",
  },
  {
    label: "Total time",
    hint: "total split: light blue first token, blue generation, orange tool calls, gray everything else. Bar length uses a square-root scale; steps compare only with steps of the same turn, turns with turns",
  },
];

/** A figure whose inputs were not recorded: a dash that says so. */
function Dash() {
  return <span title="not recorded">—</span>;
}

const ms = (value: number | null) => (value === null ? <Dash /> : formatMs(value));
const tps = (value: number | null) => (value === null ? <Dash /> : `${value.toFixed(1)} tok/s`);

const TOOL_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-teal-500",
];

/** A stable colour per tool name. */
function toolColor(name: string): string {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return TOOL_COLORS[hash % TOOL_COLORS.length];
}

/**
 * The time bar: its length on a square-root scale against the longest at
 * its level, split into first token, generation, tools and the rest.
 */
function TimeBar({ timing, longest }: { timing: Timing; longest: number }) {
  const total = timing.totalMs;
  if (total === null) return <Dash />;
  const parts = [
    { ms: timing.firstTokenMs ?? 0, color: "bg-sky-300" },
    { ms: timing.generationMs ?? 0, color: "bg-blue-600" },
    { ms: timing.toolMs ?? 0, color: "bg-orange-400" },
    { ms: timing.otherMs ?? 0, color: "bg-muted-foreground/30" },
  ];
  const width = longest > 0 ? (Math.sqrt(total) / Math.sqrt(longest)) * 100 : 0;
  const title = [
    `first token ${formatMs(timing.firstTokenMs)}`,
    `generation ${formatMs(timing.generationMs)}`,
    `tool calls ${formatMs(timing.toolMs ?? 0)}`,
    `other ${formatMs(timing.otherMs)}`,
    `total ${formatMs(total)}`,
  ].join(" · ");
  return (
    <span className="flex items-center gap-2" title={title}>
      <span className="flex h-2 w-16 shrink-0">
        <span className="flex h-2 overflow-hidden rounded-sm" style={{ width: `${width}%` }}>
          {parts.map((part) => (
            <span
              key={part.color}
              className={part.color}
              style={{ width: `${total > 0 ? (part.ms / total) * 100 : 0}%` }}
            />
          ))}
        </span>
      </span>
      <span className="tabular-nums">{formatMs(total)}</span>
    </span>
  );
}

function CacheCell({ usage }: { usage: StepStat["usage"] }) {
  const hit = usage ? cacheHit(usage) : null;
  if (!usage || hit === null) return <Dash />;
  return (
    <span
      title={`cache read ${usage.cache_read.toLocaleString()} · input ${usage.input.toLocaleString()} · cache write ${usage.cache_write.toLocaleString()}`}
    >
      {hit}
    </span>
  );
}

/** One tool call in a step's Execution cell. */
function ToolChip({ tool }: { tool: ToolStat }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-blue-600 dark:text-blue-400">{tool.name}</span>{" "}
      <span className="text-muted-foreground">{tool.detail}</span>{" "}
      <span className="text-muted-foreground/70">{formatChars(tool.chars)}</span>
    </span>
  );
}

/** A turn's tool tally: one pill per tool, then the output they produced. */
function Tally({ turn }: { turn: TurnStat }) {
  const counts = new Map<string, number>();
  let chars = 0;
  for (const step of turn.steps) {
    for (const tool of step.tools) {
      counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
      chars += tool.chars;
    }
  }
  if (counts.size === 0) return <Dash />;
  return (
    <span className="flex flex-col gap-0.5">
      {[...counts].map(([name, count]) => (
        <span key={name} className="flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden className={cn("size-1.5 rounded-full", toolColor(name))} />
          {name} ×{count}
        </span>
      ))}
      <span className="text-muted-foreground">→ {formatChars(chars)}</span>
    </span>
  );
}

function StepDetails({ step }: { step: StepStat }) {
  const [wrap, setWrap] = useState(false);
  const total = step.tools.reduce((a, t) => a + t.chars, 0);
  return (
    <section aria-label={`Step ${step.step} details`} className="flex flex-col gap-3 py-2 pl-6">
      {step.answer && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium">
            Answer{" "}
            <span className="text-muted-foreground">· {formatChars(step.answer.length)}</span>
          </p>
          <p className="text-xs whitespace-pre-wrap text-muted-foreground">{step.answer}</p>
        </div>
      )}
      {step.tools.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              {step.tools.length} tool calls{" "}
              <span className="text-muted-foreground">· {total.toLocaleString()} chars</span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={wrap}
              onClick={() => setWrap((value) => !value)}
            >
              Wrap
            </Button>
          </div>
          {step.tools.map((tool) => (
            <ToolOutput key={tool.callId} tool={tool} wrap={wrap} />
          ))}
        </div>
      )}
    </section>
  );
}

function ToolOutput({ tool, wrap }: { tool: ToolStat; wrap: boolean }) {
  const { copied, copy } = useCopy(tool.output ?? "");
  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40 text-xs">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-blue-600 dark:text-blue-400">{tool.name}</span>
        <span className="truncate">{tool.detail}</span>
        <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
          {[
            `${tool.chars.toLocaleString()} chars`,
            `${tool.lines} lines`,
            ...(tool.ms === null ? [] : [formatMs(tool.ms)]),
          ].join(" · ")}
        </span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={cn(
          "max-h-56 overflow-auto px-3 py-2 font-mono text-[11px] leading-4",
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        )}
      >
        {tool.output ?? "(no result)"}
      </pre>
    </div>
  );
}

function EventRow({ event }: { event: EventStat }) {
  const dash = <Dash />;
  return (
    <tr className="text-xs text-muted-foreground">
      <td className="py-1 pl-6">
        {event.label}
        {event.at !== null && (
          <span className="block">{formatClockMs(event.at, true).slice(6)}</span>
        )}
      </td>
      <td>{event.subject}</td>
      <td>{event.detail}</td>
      {Array.from({ length: 8 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed empty cells
        <td key={i}>{dash}</td>
      ))}
    </tr>
  );
}

interface Switches {
  basis: Basis;
  events: boolean;
  delta: boolean;
}

/** The rows of one turn: its total, then (unless folded) its steps,
 * opened steps' details and, when shown, its event rows. */
function TurnRows({
  turn,
  longestTurn,
  folded,
  onToggle,
  openSteps,
  onToggleStep,
  switches,
}: {
  turn: TurnStat;
  longestTurn: number;
  folded: boolean;
  onToggle: () => void;
  openSteps: Set<string>;
  onToggleStep: (key: string) => void;
  switches: Switches;
}) {
  const totals = turnTotals(turn, switches.basis);
  const timings = turn.steps.map(stepTiming);
  const longestStep = Math.max(0, ...timings.map((t) => t.totalMs ?? 0));
  let previousContext: number | null = null;
  return (
    <>
      <tr
        className="cursor-pointer border-t align-top hover:bg-muted/40"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={!folded}
      >
        <td className="py-2 font-medium">
          Turn {turn.turn}
          {turn.startedAt !== null && (
            <span
              className="font-normal text-muted-foreground"
              title={`this turn started at ${formatClockMs(turn.startedAt, true)}`}
            >
              {" · "}
              {formatClockMs(turn.startedAt, false)}
            </span>
          )}
        </td>
        <td className="max-w-48 truncate py-2" title={turn.trigger ?? undefined}>
          {turn.trigger ?? <Dash />}
        </td>
        <td className="py-2">
          <Tally turn={turn} />
        </td>
        <td>{totals.context === null ? <Dash /> : formatKTokens(totals.context)}</td>
        <td>{totals.output === null ? <Dash /> : formatKTokens(totals.output)}</td>
        <td>
          <CacheCell usage={totals.usage} />
        </td>
        <td>{ms(totals.firstTokenMs)}</td>
        <td>{ms(totals.modelMs)}</td>
        <td>{tps(totals.tps)}</td>
        <td>{ms(totals.toolMs)}</td>
        <td>
          <TimeBar timing={totals} longest={longestTurn} />
        </td>
      </tr>
      {!folded &&
        turn.rows.map((r) => {
          if (r.kind === "event") {
            return switches.events ? (
              <EventRow
                key={`e-${r.event.label}-${r.event.at}-${r.event.subject}`}
                event={r.event}
              />
            ) : null;
          }
          const step = r.step;
          const timing = stepTiming(step);
          const context = step.usage ? contextTokens(step.usage) : null;
          const delta =
            switches.delta && context !== null && previousContext !== null
              ? context - previousContext
              : null;
          if (context !== null) previousContext = context;
          const key = `${turn.turn}-${step.step}`;
          const open = openSteps.has(key);
          return (
            <StepRows
              key={key}
              step={step}
              timing={timing}
              context={context}
              delta={delta}
              longest={longestStep}
              open={open}
              onToggle={() => onToggleStep(key)}
            />
          );
        })}
    </>
  );
}

function StepRows({
  step,
  timing,
  context,
  delta,
  longest,
  open,
  onToggle,
}: {
  step: StepStat;
  timing: Timing;
  context: number | null;
  delta: number | null;
  longest: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer align-top text-xs hover:bg-muted/40"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
      >
        <td className="py-1.5 pl-6" title="Click this row to expand or collapse the tool details">
          Step {step.step}{" "}
          <span className="text-muted-foreground">· {open ? "hide" : "details"}</span>
        </td>
        <td className="tabular-nums text-muted-foreground">
          {step.startedAt === null ? <Dash /> : formatClockMs(step.startedAt, true)}
        </td>
        <td className="max-w-72 truncate">
          {step.tools.length > 0 ? (
            step.tools.map((tool, i) => (
              <span key={tool.callId}>
                {i > 0 && " · "}
                <ToolChip tool={tool} />
              </span>
            ))
          ) : step.answer ? (
            <span title={step.answer}>
              <span className="text-blue-600 dark:text-blue-400">answer</span>
              {" · "}
              {step.answer}
            </span>
          ) : (
            <Dash />
          )}
        </td>
        <td className="tabular-nums">
          {context === null ? (
            <Dash />
          ) : (
            <>
              {formatKTokens(context)}
              {delta !== null && (
                <span className="text-muted-foreground">
                  {delta >= 0 ? "+" : "−"}
                  {formatKTokens(Math.abs(delta))}
                </span>
              )}
            </>
          )}
        </td>
        <td>{step.usage ? formatKTokens(step.usage.output) : <Dash />}</td>
        <td>
          <CacheCell usage={step.usage} />
        </td>
        <td>{ms(timing.firstTokenMs)}</td>
        <td>{ms(timing.modelMs)}</td>
        <td>{tps(timing.tps)}</td>
        <td>{ms(timing.toolMs)}</td>
        <td>
          <TimeBar timing={timing} longest={longest} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={COLUMNS.length}>
            <StepDetails step={step} />
          </td>
        </tr>
      )}
    </>
  );
}

function TotalRow({ stats }: { stats: SessionStats }) {
  const prompt = contextTokens(stats.usage);
  return (
    <tr className="border-t text-xs font-medium">
      <td className="py-2">Total</td>
      <td className="text-muted-foreground">
        {stats.turns} turns · {stats.steps} steps
      </td>
      <td />
      <td>{formatKTokens(prompt)}</td>
      <td>{formatKTokens(stats.usage.output)}</td>
      <td>
        <CacheCell usage={stats.usage} />
      </td>
      <td>{stats.ttft_steps > 0 ? formatMs(stats.ttft_ms) : <Dash />}</td>
      <td>{formatMs(stats.model_ms)}</td>
      <td>{tps(stats.decode_ms > 0 ? stats.decode_tokens / (stats.decode_ms / 1000) : null)}</td>
      <td>{formatMs(stats.tool_ms)}</td>
      <td>
        <Dash />
      </td>
    </tr>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </span>
  );
}

/**
 * The Statistics tab: one row per turn expanding to its steps, with
 * context, output, cache hit, timing and a time bar for each, built from
 * the loaded events; the total row comes from the whole log.
 */
export default function StatisticsView({
  sessionId,
  refreshKey,
  events,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: {
  sessionId: string;
  refreshKey: string;
  events: SessionEnvelope[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}) {
  const turns = useMemo(() => buildStats(events), [events]);
  const stats = useSessionStats(sessionId, refreshKey);
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [basis, setBasis] = useState<Basis>("latest");
  const [showTotal, setShowTotal] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showDelta, setShowDelta] = useState(false);

  const toggleIn = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const longestTurn = Math.max(0, ...turns.map((t) => turnTotals(t, basis).totalMs ?? 0));
  const steps = turns.reduce((a, t) => a + t.steps.length, 0);
  const anyFolded = folded.size > 0;

  return (
    <section aria-label="Statistics" className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-auto">
        <p className="py-2 text-center text-xs text-muted-foreground">
          {hasOlder ? (
            <Button variant="ghost" size="sm" disabled={loadingOlder} onClick={onLoadOlder}>
              {loadingOlder ? "Loading earlier turns…" : "Load earlier turns"}
            </Button>
          ) : (
            "Beginning of history reached"
          )}
        </p>
        {turns.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No turns yet. Statistics appear once the agent has run a turn.
          </p>
        ) : (
          <table
            aria-label="Statistics"
            className="w-full text-left text-sm tabular-nums [&_td]:pr-4 [&_td]:whitespace-nowrap [&_th]:pr-4 [&_th]:whitespace-nowrap"
          >
            <thead className="text-xs text-muted-foreground">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.label} title={c.hint} className="pb-2 font-normal">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {turns.map((turn) => (
                <TurnRows
                  key={turn.turn}
                  turn={turn}
                  longestTurn={longestTurn}
                  folded={folded.has(turn.turn)}
                  onToggle={() => setFolded((all) => toggleIn(all, turn.turn))}
                  openSteps={openSteps}
                  onToggleStep={(key) => setOpenSteps((all) => toggleIn(all, key))}
                  switches={{ basis, events: showEvents, delta: showDelta }}
                />
              ))}
            </tbody>
            {showTotal && stats && (
              <tfoot>
                <TotalRow stats={stats} />
              </tfoot>
            )}
          </table>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-xs">
        <span className="text-muted-foreground">
          {turns.length} turns · {steps} steps
        </span>
        <Toggle
          id="stats-total"
          label="Show total row"
          checked={showTotal}
          onChange={setShowTotal}
        />
        <Toggle
          id="stats-events"
          label="Show event rows"
          checked={showEvents}
          onChange={setShowEvents}
        />
        <Toggle
          id="stats-delta"
          label="Show context delta"
          checked={showDelta}
          onChange={setShowDelta}
        />
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Context basis</span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={basis}
            onValueChange={(value) => value && setBasis(value as Basis)}
          >
            <ToggleGroupItem value="latest">Latest</ToggleGroupItem>
            <ToggleGroupItem value="cumulative">Cumulative</ToggleGroupItem>
          </ToggleGroup>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setFolded(anyFolded ? new Set() : new Set(turns.map((t) => t.turn)))}
        >
          {anyFolded ? "Expand all" : "Collapse all"}
        </Button>
      </div>
    </section>
  );
}
