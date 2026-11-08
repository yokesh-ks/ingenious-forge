import { useMemo, useState } from "react";
import type { SessionEnvelope, SessionStats } from "@/api/types";
import { useCopy } from "@/components/markdown/code-tools";
import Markdown from "@/components/markdown/Markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useSessionStats } from "../hooks/use-session-stats";
import {
  answerPreview,
  buildStats,
  type CodeLine,
  cacheHit,
  callGroups,
  contextTokens,
  diffLines,
  type EventStat,
  formatChars,
  formatClock,
  formatClockMs,
  formatKTokens,
  formatMs,
  type StepStat,
  stepTiming,
  TEXT_LIMIT,
  type Timing,
  type ToolStat,
  type TurnStat,
  type TurnState,
  turnTotals,
} from "../model/build-stats";

type Basis = "latest" | "cumulative";

const COLUMNS: { label: string; hint: string; width: string }[] = [
  {
    label: "Turn / step",
    width: "13%",
    hint: "A turn row holds the turn total; click a row to expand or collapse its steps",
  },
  { label: "Trigger", width: "15%", hint: "What opened this turn: the user's message" },
  {
    label: "Execution",
    width: "13.5%",
    hint: "Tools this step called and how often; a step without tool calls previews its answer text",
  },
  { label: "Context", width: "5.5%", hint: "usage input tokens + cache read + cache write" },
  { label: "Output", width: "5.5%", hint: "usage output tokens of the step" },
  {
    label: "Cache hit",
    width: "6.5%",
    hint: "cache read ÷ (input + cache read + cache write): the share of the prompt served from cache",
  },
  { label: "First token", width: "6%", hint: "step start to the first output fragment (TTFT)" },
  {
    label: "Model time",
    width: "6%",
    hint: "step start to the settled reply (includes the first-token delay)",
  },
  { label: "Output speed", width: "7.5%", hint: "output tokens ÷ generation seconds (tok/s)" },
  {
    label: "Tool time",
    width: "6%",
    hint: "sum of every tool call up to its result inside the step; calls without a result are excluded",
  },
  {
    label: "Total time",
    width: "15.5%",
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

const TOOL_TEXT = [
  "text-blue-600 dark:text-blue-400",
  "text-green-600 dark:text-green-400",
  "text-violet-600 dark:text-violet-400",
  "text-amber-600 dark:text-amber-400",
  "text-pink-600 dark:text-pink-400",
  "text-teal-600 dark:text-teal-400",
];

const toolTone = (name: string) => {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hash % TOOL_COLORS.length;
};

/** A stable colour per tool name, as a fill and as text. */
const toolColor = (name: string) => TOOL_COLORS[toolTone(name)];
const toolText = (name: string) => TOOL_TEXT[toolTone(name)];

/** Gaps between steps below this are scheduler noise and stay hidden. */
const STEP_GAP_MIN_MS = 1_000;

/**
 * The time bar: its length on a square-root scale against the longest at
 * its level, split into first token, generation, tools and the rest.
 */
function TimeBar({
  timing,
  longest,
  startedAt = null,
  gapMs = null,
}: {
  timing: Timing;
  longest: number;
  startedAt?: number | null;
  gapMs?: number | null;
}) {
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
    ...(startedAt === null ? [] : [`started ${formatClock(startedAt)}`]),
    `first token ${formatMs(timing.firstTokenMs)}`,
    `generation ${formatMs(timing.generationMs)}`,
    `tool calls ${formatMs(timing.toolMs ?? 0)}`,
    `other ${formatMs(timing.otherMs)}`,
    `total ${formatMs(total)}`,
    ...(gapMs !== null && gapMs >= STEP_GAP_MIN_MS
      ? [`gap since previous step ${formatMs(gapMs)}`]
      : []),
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

const WARN = "ml-1.5 font-normal text-amber-600 dark:text-amber-400";

/** A row's state beside its label: running, interrupted or failed, and a
 * cache miss when less than half the prompt came from cache. */
function Markers({ state, usage }: { state?: TurnState; usage: StepStat["usage"] }) {
  const prompt = usage ? contextTokens(usage) : 0;
  const miss = usage !== null && prompt > 0 && usage.cache_read / prompt < 0.5;
  return (
    <>
      {state === "running" && <span className="ml-1.5 font-normal text-blue-600">running</span>}
      {state === "interrupted" && <span className={WARN}>interrupted</span>}
      {state === "failed" && (
        <span
          className="ml-1.5 font-normal text-muted-foreground"
          title="The turn closed without a settled reply"
        >
          failed
        </span>
      )}
      {miss && (
        <span
          className={WARN}
          title="The prompt barely hit the cache: usually the first request after a restart or a session resume, paid at full input price"
        >
          cache miss
        </span>
      )}
    </>
  );
}

const PILL =
  "inline-flex h-[19px] items-center gap-1 rounded-[2px] border-[0.5px] bg-muted px-1.5 text-[10px]";

function FailedPill({ count }: { count: number }) {
  return (
    <span
      className="mr-1.5 inline-flex h-[19px] items-center rounded-[2px] bg-destructive px-1.5 text-[10px] font-semibold text-background"
      title={`${count} tool calls in this step returned an error result`}
    >
      {count} failed
    </span>
  );
}

/** What a group of calls produced: lines read, lines changed or characters. */
function ToolOutputStat({ name, calls }: { name: string; calls: ToolStat[] }) {
  if (name === "read") {
    const lines = calls.reduce((a, c) => a + c.lines, 0);
    return lines > 0 ? <span> {lines.toLocaleString()} lines</span> : null;
  }
  if (name === "edit" || name === "write") {
    const added = calls.reduce((a, c) => a + (c.added ?? 0), 0);
    const removed = calls.reduce((a, c) => a + (c.removed ?? 0), 0);
    if (added === 0 && removed === 0) return null;
    return (
      <span>
        {" "}
        {added > 0 && (
          <span className="text-green-700 dark:text-green-400">
            +{added.toLocaleString()}
            {removed > 0 ? "" : " lines"}
          </span>
        )}
        {added > 0 && removed > 0 && " "}
        {removed > 0 && (
          <span className="text-red-700 dark:text-red-400">
            −{removed.toLocaleString()}
            {added > 0 ? "" : " lines"}
          </span>
        )}
      </span>
    );
  }
  const chars = calls.reduce((a, c) => a + c.chars, 0);
  return chars > 0 ? <span> {formatChars(chars)}</span> : null;
}

const CLIP = "inline-block max-w-[380px] truncate align-bottom";

/** A step's Execution cell: up to three call groups by tool and target,
 * or the answer's first line when it called none. */
function StepExecution({ step }: { step: StepStat }) {
  const failed = step.tools.filter((t) => t.isError).length;
  if (step.tools.length === 0) {
    const preview = answerPreview(step.answer);
    return (
      <span className={CLIP} title={step.answer ?? undefined}>
        {step.endedAt === null ? "generating" : step.answer ? "answer" : "no answer"}
        {preview && <span className="text-muted-foreground"> · {preview}</span>}
      </span>
    );
  }
  const groups = callGroups(step.tools);
  const shown = groups.slice(0, 3);
  const hidden = step.tools.length - shown.reduce((a, g) => a + g.calls.length, 0);
  return (
    <span className={CLIP}>
      {failed > 0 && <FailedPill count={failed} />}
      {shown.map((group, i) => (
        <span key={group.key}>
          {i > 0 && <span className="mx-1 text-muted-foreground/60">·</span>}
          <span className={cn("font-medium", toolText(group.name))}>{group.name}</span>
          {group.calls.length > 1 && (
            <span className={cn(PILL, "mx-[3px] px-[5px]")}>×{group.calls.length}</span>
          )}
          {group.hint && <span className="text-muted-foreground"> {group.hint}</span>}
          <ToolOutputStat name={group.name} calls={group.calls} />
        </span>
      ))}
      {hidden > 0 && <span className="text-muted-foreground"> {hidden} more calls</span>}
    </span>
  );
}

/** A turn's tool tally: up to three pills by call count, the output they
 * produced, and a bar of the tool mix. */
function Tally({ turn }: { turn: TurnStat }) {
  const tools = turn.steps.flatMap((s) => s.tools);
  if (tools.length === 0) {
    const answer = [...turn.steps].reverse().find((s) => s.answer)?.answer ?? null;
    const preview = answerPreview(answer);
    return (
      <span className={CLIP} title={answer ?? undefined}>
        {turn.state === "running" ? "generating" : answer ? "answer" : "no answer"}
        {preview && <span className="text-muted-foreground"> · {preview}</span>}
      </span>
    );
  }
  const counts = new Map<string, number>();
  for (const tool of tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const chars = tools.reduce((a, t) => a + t.chars, 0);
  const failed = tools.filter((t) => t.isError).length;
  return (
    <span
      className="block max-w-[380px]"
      title={`${tools.length} calls: ${sorted.map(([n, c]) => `${n} ×${c}`).join(" · ")}`}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        {failed > 0 && <FailedPill count={failed} />}
        {sorted.slice(0, 3).map(([name, count]) => (
          <span key={name} className={PILL}>
            <span aria-hidden className={cn("size-1.5 rounded-full", toolColor(name))} />
            {name} ×{count}
          </span>
        ))}
        {sorted.length > 3 && (
          <span className={cn(PILL, "text-muted-foreground")}>{sorted.length - 3} more</span>
        )}
        {chars > 0 && (
          <span
            className={cn(PILL, "text-muted-foreground")}
            title={`${chars.toLocaleString()} characters of tool output in this step; they become part of the next prompt`}
          >
            → {formatChars(chars)}
          </span>
        )}
      </span>
      <span aria-hidden className="mt-[5px] flex h-1 overflow-hidden rounded-sm bg-muted">
        {sorted.map(([name, count]) => (
          <span key={name} className={toolColor(name)} style={{ flexGrow: count }} />
        ))}
      </span>
    </span>
  );
}

/** Calls listed in a step's details. */
const CALL_LIMIT = 12;
/** Lines shown in one code block. */
const CODE_LINE_LIMIT = 400;

function CodeBlock({ lines, wrap }: { lines: CodeLine[]; wrap: boolean }) {
  const shown = lines.slice(0, CODE_LINE_LIMIT);
  return (
    <pre
      className={cn(
        "m-0 max-h-80 overflow-auto px-2 py-1.5 font-mono text-[11px] leading-4",
        wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
      )}
    >
      {shown.map((line, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity
          key={i}
          className={cn(
            "block",
            line.sign === "+" && "bg-green-500/10 text-green-800 dark:text-green-300",
            line.sign === "−" && "bg-red-500/10 text-red-800 dark:text-red-300",
          )}
        >
          {line.sign === " " ? line.text : `${line.sign} ${line.text}`}
        </span>
      ))}
      {shown.length < lines.length && (
        <span className="block py-1.5 text-muted-foreground">
          Showing the first {shown.length.toLocaleString()} of {lines.length.toLocaleString()} lines
        </span>
      )}
    </pre>
  );
}

const plain = (text: string): CodeLine[] =>
  (text === "" ? [] : text.split("\n")).map((line) => ({ sign: " ", text: line }));

/** A read's file: its path and content without the line numbers. */
function fileOf(text: string | null): { path: string | null; lines: CodeLine[] } | null {
  if (text === null) return null;
  const content = /<content>\n?([\s\S]*?)<\/content>/.exec(text);
  if (!content) return null;
  const path = /<path>([\s\S]*?)<\/path>/.exec(text)?.[1].trim() ?? null;
  const body = content[1].replace(/\n$/, "");
  return {
    path,
    lines: body.split("\n").map((line) => ({ sign: " ", text: line.replace(/^\s*\d+:\s?/, "") })),
  };
}

const SUB = "px-2 pt-1 text-[11px] text-muted-foreground";

/** One call's body: its raw arguments, its diff, its file or its result. */
function CallBody({ tool, wrap, raw }: { tool: ToolStat; wrap: boolean; raw: boolean }) {
  if (raw) {
    return (
      <>
        <div className={SUB}>raw arguments</div>
        <CodeBlock lines={plain(JSON.stringify(tool.args, null, 2))} wrap />
      </>
    );
  }
  if ((tool.name === "edit" || tool.name === "write") && tool.diff) {
    const lines = diffLines(tool.diff);
    if (lines.length > 0) {
      return (
        <>
          <div className={SUB}>change</div>
          <CodeBlock lines={lines} wrap={wrap} />
        </>
      );
    }
  }
  const file = tool.name === "read" ? fileOf(tool.output) : null;
  if (file) {
    return (
      <>
        <div className={SUB}>
          {file.path ?? "file"} · {file.lines.length.toLocaleString()} lines
        </div>
        <CodeBlock lines={file.lines} wrap={wrap} />
      </>
    );
  }
  if (!tool.output) {
    return (
      <span className="block px-2 py-1.5 text-[11px] text-muted-foreground">
        This call left no text
      </span>
    );
  }
  return (
    <>
      {tool.truncated && (
        <div className={SUB}>
          Too long: only the first {tool.output.length.toLocaleString()} characters are kept
        </div>
      )}
      <CodeBlock lines={plain(tool.output)} wrap={wrap} />
    </>
  );
}

const CHIP =
  "mr-2 inline-flex h-[19px] items-center rounded-[2px] border-[0.5px] bg-muted px-1.5 text-[10px] aria-pressed:border-blue-600";

function CallBlock({ tool, wrap }: { tool: ToolStat; wrap: boolean }) {
  const [raw, setRaw] = useState(false);
  const pretty = JSON.stringify(tool.args, null, 2);
  const { copied, copy } = useCopy(raw ? pretty : (tool.output ?? ""));
  const meta = [
    `${tool.chars.toLocaleString()} chars`,
    `${tool.lines.toLocaleString()} lines`,
    ...(tool.ms === null ? [] : [formatMs(tool.ms)]),
  ];
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40 text-xs">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <span className={cn("font-medium", toolText(tool.name))}>{tool.name}</span>
        {tool.hint && <span className="truncate">{tool.hint}</span>}
        <span className="shrink-0 text-muted-foreground tabular-nums">· {meta.join(" · ")}</span>
        {tool.isError && <FailedPill count={1} />}
        <button
          type="button"
          className={cn(CHIP, "ml-1 shrink-0")}
          title="Show the raw JSON arguments"
          aria-pressed={raw}
          onClick={() => setRaw((value) => !value)}
        >
          {"{}"}
        </button>
        <button
          type="button"
          onClick={copy}
          title="Copy this text"
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <CallBody tool={tool} wrap={wrap} raw={raw} />
    </div>
  );
}

function StepDetails({ step }: { step: StepStat }) {
  const [wrap, setWrap] = useState(false);
  const total = step.tools.reduce((a, t) => a + t.chars, 0);
  const answer = step.answer?.slice(0, TEXT_LIMIT) ?? null;
  const listed = step.tools.slice(0, CALL_LIMIT);
  return (
    <section aria-label={`Step ${step.step} details`} className="flex flex-col gap-3 py-2 pl-6">
      {answer && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium">
            Answer{" "}
            <span className="font-normal text-muted-foreground">
              · {answer.length.toLocaleString()} chars
            </span>
          </p>
          <Markdown text={answer} className="text-xs leading-5" />
          {step.answer && step.answer.length > TEXT_LIMIT && (
            <p className="text-[11px] text-muted-foreground">
              Answer is long; only the first 16,000 chars are kept
            </p>
          )}
        </div>
      )}
      {step.tools.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              {step.tools.length} tool calls
              {total > 0 && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {total.toLocaleString()} chars
                </span>
              )}
            </p>
            <button
              type="button"
              className={CHIP}
              title="Wrap long lines instead of scrolling sideways"
              aria-pressed={wrap}
              onClick={() => setWrap((value) => !value)}
            >
              Wrap
            </button>
          </div>
          {listed.map((tool) => (
            <CallBlock key={tool.callId} tool={tool} wrap={wrap} />
          ))}
          {step.tools.length > listed.length && (
            <p className="text-[11px] text-muted-foreground">
              {step.tools.length - listed.length} more calls are not listed (at most {CALL_LIMIT}{" "}
              per step)
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function EventRow({ event }: { event: EventStat }) {
  const dash = <Dash />;
  return (
    <tr
      className="text-xs text-muted-foreground"
      title="Non-step event rows: request, prompt, approval and setting changes excluded from the turn step totals"
    >
      <td className="py-1 pl-[22px]! shadow-[inset_2px_0_0_var(--color-border)]">
        {event.label}
        {event.at !== null && <span className="block">{formatClock(event.at)}</span>}
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
  let previousEnd: number | null = null;
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
        <td className="py-1.5 font-semibold whitespace-normal!">
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
          <Markers state={turn.state} usage={totals.usage} />
        </td>
        <td className="py-1.5" title={turn.trigger ?? undefined}>
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
          <TimeBar timing={totals} longest={longestTurn} startedAt={turn.startedAt} />
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
          const gapMs =
            previousEnd !== null && step.startedAt !== null && step.startedAt > previousEnd
              ? step.startedAt - previousEnd
              : null;
          if (step.endedAt !== null) previousEnd = step.endedAt;
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
              gapMs={gapMs}
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
  gapMs,
  open,
  onToggle,
}: {
  step: StepStat;
  timing: Timing;
  context: number | null;
  delta: number | null;
  longest: number;
  gapMs: number | null;
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
        <td
          className="h-[30px] pl-[22px]! text-muted-foreground shadow-[inset_2px_0_0_var(--color-border)]"
          title="Click this row to expand or collapse the tool details"
        >
          Step {step.step}{" "}
          <span className="text-muted-foreground">· {open ? "hide" : "details"}</span>
          <Markers usage={step.usage} />
        </td>
        <td className="tabular-nums text-muted-foreground">
          {step.startedAt === null ? <Dash /> : formatClockMs(step.startedAt, true)}
        </td>
        <td>
          <StepExecution step={step} />
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
          <TimeBar timing={timing} longest={longest} startedAt={step.startedAt} gapMs={gapMs} />
        </td>
      </tr>
      {open && (
        <tr>
          <td
            colSpan={COLUMNS.length}
            className="pt-1.5 pr-2 pb-3 pl-[22px]! whitespace-normal! shadow-[inset_2px_0_0_var(--color-border)]"
          >
            <StepDetails step={step} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The whole session's figures from its full log. No whole-session wall
 * time exists, so its total time is model time plus tool time. */
function TotalRow({ stats }: { stats: SessionStats }) {
  const prompt = contextTokens(stats.usage);
  const totalMs = stats.model_ms + stats.tool_ms;
  const firstTokenMs = stats.ttft_steps > 0 ? stats.ttft_ms : null;
  const timing: Timing = {
    firstTokenMs,
    generationMs: stats.decode_ms,
    modelMs: stats.model_ms,
    toolMs: stats.tool_ms,
    totalMs,
    otherMs: 0,
    tps: stats.decode_ms > 0 ? stats.decode_tokens / (stats.decode_ms / 1000) : null,
  };
  return (
    <tr
      className="border-t text-xs font-medium"
      title="Totals for the complete session; total time is model time + tool time (no inter-turn gaps)"
    >
      <td colSpan={2} className="py-2">
        Whole-session total
        <span className="font-normal text-muted-foreground">
          {" "}
          · {stats.turns} turns · {stats.steps} steps
        </span>
      </td>
      <td />
      <td>{formatKTokens(prompt)}</td>
      <td>{formatKTokens(stats.usage.output)}</td>
      <td>
        <CacheCell usage={stats.usage} />
      </td>
      <td>{ms(firstTokenMs)}</td>
      <td>{formatMs(stats.model_ms)}</td>
      <td>{tps(timing.tps)}</td>
      <td>{formatMs(stats.tool_ms)}</td>
      <td>
        <TimeBar timing={timing} longest={totalMs} />
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
            className="w-full table-fixed border-collapse text-left text-xs tabular-nums [&_td]:overflow-hidden [&_td]:px-2 [&_td]:text-ellipsis [&_td]:whitespace-nowrap [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:bg-background [&_th]:px-2 [&_th]:py-1 [&_th]:align-bottom [&_th]:leading-tight [&_th]:font-medium"
          >
            <colgroup>
              {COLUMNS.map((c) => (
                <col key={c.label} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead className="text-muted-foreground">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.label} title={c.hint}>
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
