import { ChevronRightIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { JsonValue, ToolSchema, Usage } from "@/api/types";
import ResizeHandle from "@/components/layout/ResizeHandle";
import Markdown from "@/components/markdown/Markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMs } from "@/features/stats/model/build-stats";
import { cn } from "@/lib/utils";
import {
  type AssistantRecord,
  type Block,
  replyDuration,
  requestIdOf,
  sessionUsageUpTo,
  type ToolRecord,
  type TrajectoryRecord,
} from "../model/build-trajectory";
import JsonTree from "./JsonTree";
import KindBadge from "./KindBadge";

/** What the inspector shows: a record, or the model request behind a reply. */
export type Selection =
  | { type: "record"; record: TrajectoryRecord }
  | { type: "request"; reply: AssistantRecord };

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A logged time in full: "2026-11-08 09:15:18.461". */
export function formatStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

const tok = (n: number) => `${n} tok`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-0.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>;
}

/** A Summary section whose heading opens its own tab. */
function Section({
  title,
  onOpen,
  children,
}: {
  title: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-0.5">
            {title}
            <ChevronRightIcon aria-hidden className="size-3 text-muted-foreground" />
          </button>
        ) : (
          title
        )}
      </h3>
      {children}
    </section>
  );
}

function Text({ children }: { children: string }) {
  return (
    <pre className="font-mono text-[11px] leading-[18px] whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

function ToolStatusText({ status }: { status: ToolRecord["status"] }) {
  if (status === "failed") return <span className="text-destructive">Failed</span>;
  return <>{status === "pending" ? "Pending" : "Completed"}</>;
}

function Schema({ schema }: { schema: ToolSchema | null }) {
  if (!schema) return <Muted>Schema unavailable</Muted>;
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-xs font-semibold">{schema.name}</p>
      <p className="text-xs text-muted-foreground">{schema.description}</p>
      <p className="mt-1 text-xs font-medium">Parameters</p>
      <JsonTree value={schema.parameters} label={`${schema.name} parameters JSON`} />
    </div>
  );
}

function ToolTiming({ record }: { record: ToolRecord }) {
  return (
    <Fields>
      <Field label="Started">
        {record.startedAt === null ? "Not recorded" : formatStamp(record.startedAt)}
      </Field>
      <Field label="Duration">
        {record.startedAt !== null && record.endedAt !== null
          ? formatMs(record.endedAt - record.startedAt)
          : "Not available"}
      </Field>
      <Field label="Timing source">
        {record.endedAt === null ? "Session timestamps (running)" : "Session timestamps"}
      </Field>
    </Fields>
  );
}

function Payload({ args }: { args: JsonValue }) {
  return <JsonTree value={args} label="Payload JSON" />;
}

function Rendered({ record }: { record: ToolRecord }) {
  if (record.output === null) return <Muted>No result captured</Muted>;
  if (record.output === "") return <Muted>No output</Muted>;
  return <Text>{record.output}</Text>;
}

function RequestTiming({ reply }: { reply: AssistantRecord }) {
  const total = replyDuration(reply);
  const tps =
    reply.usage && reply.generationMs ? reply.usage.output / (reply.generationMs / 1000) : null;
  return (
    <Fields>
      <Field label="Started">
        {reply.startedAt === null ? "Step start unavailable" : formatStamp(reply.startedAt)}
      </Field>
      <Field label="Total duration">{total === null ? "Not recorded" : formatMs(total)}</Field>
      <Field label="TTFT">
        {reply.firstTokenMs === null ? "First token unavailable" : formatMs(reply.firstTokenMs)}
      </Field>
      <Field label="Generation">
        {reply.generationMs === null ? "Not recorded" : formatMs(reply.generationMs)}
      </Field>
      <Field label="Throughput">
        {tps === null ? "Output tokens unavailable" : `${tps.toFixed(1)} tok/s`}
      </Field>
    </Fields>
  );
}

function UsageFields({ usage }: { usage: Usage | null }) {
  if (!usage) return <Muted>Usage not reported</Muted>;
  return (
    <Fields>
      <Field label="Input">{tok(usage.input + usage.cache_read + usage.cache_write)}</Field>
      <Field label="Cached">{tok(usage.cache_read)}</Field>
      {usage.cache_write > 0 && <Field label="Cache created">{tok(usage.cache_write)}</Field>}
      <Field label="Other">{tok(usage.input)}</Field>
      <Field label="Output">{tok(usage.output)}</Field>
    </Fields>
  );
}

function Blocks({ blocks, raw }: { blocks: Block[]; raw: boolean }) {
  if (blocks.length === 0) return <Muted>No content</Muted>;
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks keep their order
        <div key={i} className="flex flex-col gap-0.5">
          {raw ? (
            <p className="text-[11px] text-muted-foreground">
              Block #{i + 1} {block.type}
            </p>
          ) : (
            block.type === "thinking" && (
              <p className="text-[11px] text-muted-foreground">Thinking</p>
            )
          )}
          {block.type === "tool-call" && !raw && (
            <p className="font-mono text-xs font-semibold">{block.name}</p>
          )}
          {block.type === "text" && !raw ? (
            <Markdown text={block.text} className="text-xs leading-5" />
          ) : (
            <Text>{block.text}</Text>
          )}
        </div>
      ))}
    </div>
  );
}

interface TabSpec {
  name: string;
  body: ReactNode;
}

function tabsFor(
  selection: Selection,
  records: TrajectoryRecord[],
  open: (tab: string) => void,
  select: (id: string) => void,
): TabSpec[] {
  if (selection.type === "request") {
    const reply = selection.reply;
    const options: JsonValue = {
      provider: reply.provider,
      model: reply.model,
      max_tokens: reply.maxTokens,
    };
    return [
      {
        name: "Summary",
        body: (
          <>
            <Fields>
              <Field label="Status">{reply.endedAt === null ? "Pending" : "Completed"}</Field>
              <Field label="Provider">{reply.provider}</Field>
              <Field label="Model">{reply.model}</Field>
              <Field label="Tool calls">{reply.toolCalls}</Field>
              <Field label="Result">
                <LinkButton onClick={() => select(reply.id)}>Assistant Message</LinkButton>
              </Field>
            </Fields>
            <Section title="Options" onOpen={() => open("Options")}>
              <JsonTree value={options} label="Request options JSON" />
            </Section>
            <Section title="Usage" onOpen={() => open("Usage")}>
              <UsageFields usage={reply.usage} />
            </Section>
            <Section title="Timing" onOpen={() => open("Timing")}>
              <RequestTiming reply={reply} />
            </Section>
          </>
        ),
      },
      { name: "Options", body: <JsonTree value={options} label="Request options JSON" /> },
      {
        name: "Usage",
        body: (
          <>
            <Section title="This request">
              <UsageFields usage={reply.usage} />
            </Section>
            <Section title="Session cumulative">
              <UsageFields usage={sessionUsageUpTo(records, reply.request)} />
            </Section>
          </>
        ),
      },
      { name: "Timing", body: <RequestTiming reply={reply} /> },
    ];
  }

  const record = selection.record;
  switch (record.kind) {
    case "system":
      return [
        { name: "System Prompt", body: <Text>{record.text}</Text> },
        {
          name: "Tools",
          body:
            record.tools.length === 0 ? (
              <Muted>No tools in this request</Muted>
            ) : (
              <div className="flex flex-col gap-3">
                {record.tools.map((tool) => (
                  <div key={tool.name}>
                    <p className="font-mono text-xs font-semibold">{tool.name}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                ))}
              </div>
            ),
        },
      ];
    case "user":
    case "context": {
      const source: JsonValue =
        record.kind === "user"
          ? { kind: record.source === "steering" ? "steering" : "user" }
          : { kind: "project-instructions", path: record.source };
      return [
        {
          name: "Summary",
          body: (
            <>
              <Fields>
                <Field label="Source">
                  {record.kind === "context"
                    ? record.source
                    : record.source === "steering"
                      ? "Steering"
                      : "User"}
                </Field>
                <Field label="Status">Completed</Field>
              </Fields>
              <Section title="Preview" onOpen={() => open("Preview")}>
                <Text>{record.text}</Text>
              </Section>
            </>
          ),
        },
        { name: "Preview", body: <Text>{record.text}</Text> },
        { name: "Raw", body: <Blocks blocks={[{ type: "text", text: record.text }]} raw /> },
        { name: "Source", body: <JsonTree value={source} label="Message source JSON" /> },
      ];
    }
    case "assistant":
      return [
        {
          name: "Summary",
          body: (
            <>
              <Fields>
                <Field label="Source">
                  <LinkButton onClick={() => select(requestIdOf(record))}>
                    Request #{record.request}
                  </LinkButton>
                </Field>
                <Field label="Status">{record.endedAt === null ? "Pending" : "Completed"}</Field>
                <Field label="Tokens">
                  {record.usage ? tok(record.usage.output) : "Usage unavailable"}
                </Field>
              </Fields>
              <Section title="Preview" onOpen={() => open("Preview")}>
                <Blocks blocks={record.blocks} raw={false} />
              </Section>
              <Section title="Request Timing">
                <RequestTiming reply={record} />
              </Section>
            </>
          ),
        },
        { name: "Preview", body: <Blocks blocks={record.blocks} raw={false} /> },
        { name: "Raw", body: <Blocks blocks={record.blocks} raw /> },
      ];
    case "tool":
      return [
        {
          name: "Summary",
          body: (
            <>
              <Fields>
                <Field label="Hierarchy">
                  {record.parentId ? (
                    <LinkButton onClick={() => select(record.parentId ?? "")}>
                      Assistant Message
                    </LinkButton>
                  ) : (
                    "Not recorded"
                  )}
                </Field>
                <Field label="Status">
                  <ToolStatusText status={record.status} />
                </Field>
              </Fields>
              <Section title="Payload" onOpen={() => open("Payload")}>
                <Payload args={record.args} />
              </Section>
              <Section title="Result" onOpen={() => open("Result")}>
                <div
                  className={cn(
                    "max-h-36 overflow-auto overscroll-contain",
                    (record.output ?? "").split("\n").length > 8 &&
                      "[mask-image:linear-gradient(to_bottom,#000_calc(100%-12px),transparent)]",
                  )}
                >
                  <Rendered record={record} />
                </div>
              </Section>
              <Section title="Schema" onOpen={() => open("Schema")}>
                <Schema schema={record.schema} />
              </Section>
              <Section title="Timing" onOpen={() => open("Timing")}>
                <ToolTiming record={record} />
              </Section>
            </>
          ),
        },
        { name: "Payload", body: <Payload args={record.args} /> },
        {
          name: "Result",
          body: (
            <>
              <Section title="Raw result">
                {record.meta === null ? (
                  <Muted>No structured result was recorded for this call</Muted>
                ) : (
                  <JsonTree value={record.meta} label="Result JSON" />
                )}
              </Section>
              <Section title="Rendered result">
                <Rendered record={record} />
              </Section>
            </>
          ),
        },
        { name: "Schema", body: <Schema schema={record.schema} /> },
        { name: "Timing", body: <ToolTiming record={record} /> },
      ];
  }
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 hover:underline"
    >
      {children}
      <ChevronRightIcon aria-hidden className="size-3 text-muted-foreground" />
    </button>
  );
}

function heading(selection: Selection): { badge: ReactNode; subtitle: string } {
  if (selection.type === "request") {
    const reply = selection.reply;
    return {
      badge: <span className="text-xs font-semibold">Request #{reply.request}</span>,
      subtitle: reply.turn === null ? "" : `Turn ${reply.turn}`,
    };
  }
  const record = selection.record;
  if (record.kind === "system") {
    return { badge: <KindBadge kind="system" />, subtitle: record.preview };
  }
  const parts = [
    ...(record.turn === null ? [] : [`Turn ${record.turn}`]),
    ...(record.step === null ? [] : [`Step ${record.step}`]),
  ];
  return { badge: <KindBadge kind={record.kind} />, subtitle: parts.join(" · ") };
}

const WIDTH_MIN = 320;
const WIDTH_MAX = 720;
const LEDGER_MIN = 280;

const clampWidth = (width: number, split: number) =>
  Math.round(
    Math.min(
      Math.max(width, WIDTH_MIN),
      Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, split - LEDGER_MIN)),
    ),
  );

/**
 * The record inspector beside the ledger: a heading, then tabs that depend
 * on what is selected. The open tab is kept when the next selection has
 * one of the same name.
 */
export default function RecordInspector({
  selection,
  records,
  tab,
  onTab,
  width,
  onWidth,
  onSelect,
  onClose,
}: {
  selection: Selection;
  records: TrajectoryRecord[];
  tab: string;
  onTab: (tab: string) => void;
  width: number | null;
  onWidth: (width: number | null) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const tabs = tabsFor(selection, records, onTab, onSelect);
  const current = tabs.some((t) => t.name === tab) ? tab : tabs[0].name;
  const { badge, subtitle } = heading(selection);
  return (
    <aside
      aria-label="Event details"
      style={width === null ? undefined : { width }}
      className="relative flex min-h-0 w-[clamp(320px,38%,440px)] max-w-[calc(100%-280px)] shrink-0 flex-col border-l bg-background"
    >
      <ResizeHandle
        label="Resize event details"
        width={width}
        min={WIDTH_MIN}
        max={WIDTH_MAX}
        clamp={clampWidth}
        onWidth={onWidth}
      />
      <div className="flex items-center gap-2 px-3 pt-2">
        {badge}
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        <button
          type="button"
          aria-label="Close details"
          onClick={onClose}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      </div>
      <Tabs value={current} onValueChange={onTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList variant="line" className="px-2">
          {tabs.map((t) => (
            <TabsTrigger key={t.name} value={t.name} className="text-xs">
              {t.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent
            key={t.name}
            value={t.name}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 py-2"
          >
            {t.body}
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  );
}
