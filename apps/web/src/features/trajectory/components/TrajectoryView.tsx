import { SearchIcon, SquareMinusIcon, SquarePlusIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SessionEnvelope } from "@/api/types";
import { formatMs } from "@/features/stats/model/build-stats";
import { useQueryParam } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  buildTrajectory,
  type LedgerRow,
  ledgerRows,
  previewText,
  type TrajectoryRecord,
} from "../model/build-trajectory";
import KindBadge from "./KindBadge";
import RecordInspector, { type Selection } from "./RecordInspector";

/** Pixels from the bottom that still count as following new rows. */
const FOLLOW_SLACK = 40;

const MONO = "font-mono text-[11.5px]";

/** A record's duration and output tokens, for the ledger's right edge. */
function rowMeta(record: TrajectoryRecord): string {
  if (record.kind === "tool") {
    return record.startedAt !== null && record.endedAt !== null
      ? formatMs(record.endedAt - record.startedAt)
      : "";
  }
  if (record.kind === "assistant") {
    const parts = [
      ...(record.startedAt !== null && record.endedAt !== null
        ? [formatMs(record.endedAt - record.startedAt)]
        : []),
      ...(record.usage ? [`${record.usage.output} tok`] : []),
    ];
    return parts.join(" · ");
  }
  return "";
}

function rowLabel(record: TrajectoryRecord): string {
  const kind = record.kind.toUpperCase();
  return record.kind === "assistant"
    ? `Request ${record.request}, ${kind}, ${record.preview}`
    : `${kind}, ${record.preview}`;
}

function Preview({ record }: { record: TrajectoryRecord }) {
  if (record.kind === "tool") {
    const args = JSON.stringify(record.args);
    return (
      <span
        className="grid min-w-0 grid-cols-[clamp(180px,calc(36cqw-56px),480px)_minmax(0,1fr)] items-baseline gap-2"
        title={record.preview}
      >
        <span className="flex min-w-0 items-baseline">
          <span className={cn(MONO, "font-medium")}>{record.name}</span>
          <span className={cn(MONO, "truncate pl-1.5 text-muted-foreground")}>{args}</span>
        </span>
        {record.output !== null && (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="text-muted-foreground">→</span>
            <span
              className={cn(
                MONO,
                "truncate",
                record.status === "failed" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {previewText(record.output)}
            </span>
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      className={cn("block truncate", record.kind === "context" && "text-muted-foreground")}
      title={record.preview}
    >
      {record.preview}
    </span>
  );
}

const ROW = "h-[30px] cursor-pointer text-xs";

/** Rows rendered at once; earlier ones are revealed on request, so a long
 * session's ledger stays small in the page. */
const WINDOW = 200;

/** The ledger row a selection points at: a request selects its reply's. */
const rowId = (selected: string | null) => selected?.replace(/^request:/, "reply:") ?? null;

function RecordRow({
  row,
  selected,
  activeTurn,
  onSelect,
  onFlip,
}: {
  row: Extract<LedgerRow, { type: "record" }>;
  selected: string | null;
  activeTurn: number | null;
  onSelect: (id: string) => void;
  onFlip: (key: string) => void;
}) {
  const { record } = row;
  const isSelected = selected === record.id;
  const requestSelected = record.kind === "assistant" && selected === `request:${record.request}`;
  const inActiveTurn =
    activeTurn !== null && record.turn === activeTurn && record.preview !== "Initial System Prompt";
  return (
    <tr
      data-id={record.id}
      data-active-turn={inActiveTurn || undefined}
      aria-label={rowLabel(record)}
      aria-selected={isSelected}
      tabIndex={0}
      onClick={() => onSelect(record.id)}
      onDoubleClick={() => {
        if (record.kind === "assistant" && record.toolCalls > 0) onFlip(`calls:${record.id}`);
        else if (row.turnStart) onFlip(`turn:${record.turn}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(record.id);
        }
      }}
      className={cn(
        ROW,
        "border-b border-border/40 hover:bg-muted/50",
        row.turnStart && "border-t border-t-border",
        isSelected && "bg-muted",
      )}
    >
      <td className="relative w-[112px] pr-2 pl-1">
        {inActiveTurn && (
          <span aria-hidden className="absolute -top-px -bottom-px left-0 w-0.5 bg-blue-500/30" />
        )}
        {isSelected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-blue-600" />}
        {row.turnStart && record.turn !== null && (
          <span
            className={cn(
              "absolute top-0 left-0 z-[3] rounded-br-[2px] bg-muted px-[5px] py-px font-mono text-[8px] leading-[10px] text-muted-foreground",
              inActiveTurn && "bg-blue-500/20 text-blue-700 dark:text-blue-300",
            )}
          >
            Turn {record.turn}
          </span>
        )}
        {record.kind === "assistant" && (
          <button
            type="button"
            aria-label={`Request #${record.request}`}
            aria-pressed={requestSelected}
            title={`Request #${record.request}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(`request:${record.request}`);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="group absolute -top-2 left-3 z-[6] size-4"
          >
            <span
              className={cn(
                "absolute top-[5.5px] left-[5.5px] size-[5px] rounded-full bg-muted-foreground/50 ring-2 ring-background group-hover:bg-blue-600",
                requestSelected && "bg-blue-600",
              )}
            />
          </button>
        )}
        <span className="flex justify-end">
          <KindBadge kind={record.kind} />
        </span>
      </td>
      <td className="max-w-0 pr-2">
        <Preview record={record} />
      </td>
      <td className="w-[112px] pr-3 text-right text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
        {rowMeta(record)}
      </td>
    </tr>
  );
}

function SummaryRow({
  row,
  onOpen,
}: {
  row: Extract<LedgerRow, { type: "calls" | "turn" }>;
  onOpen: () => void;
}) {
  const kind = row.type === "turn" ? "turn" : "assistant";
  return (
    <tr
      aria-label={`Collapsed ${kind} summary, ${row.summary}`}
      tabIndex={0}
      title="Open this group"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(ROW, "border-b border-border/40 text-muted-foreground hover:bg-muted/50")}
    >
      <td />
      <td colSpan={2} className={row.type === "calls" ? "pl-4" : ""}>
        … {row.summary}
      </td>
    </tr>
  );
}

function FoldButton({
  label,
  folded,
  onToggle,
}: {
  label: string;
  folded: boolean;
  onToggle: () => void;
}) {
  const Icon = folded ? SquarePlusIcon : SquareMinusIcon;
  return (
    <button
      type="button"
      aria-label={`${folded ? "Expand" : "Collapse"} ${label.toLowerCase()}`}
      title={`${folded ? "Expand" : "Collapse"} ${label.toLowerCase()}`}
      aria-pressed={folded}
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:text-foreground"
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </button>
  );
}

/**
 * The Trajectory tab: every record of the session in a ledger, with fold
 * and search controls, and an inspector beside it for the selected record
 * (`?record=` in the URL, which Inspect in the chat sets).
 */
export default function TrajectoryView({
  events,
  loaded = true,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: {
  events: SessionEnvelope[];
  /** Whether the session's history has arrived; until then the ledger
   * says it is loading rather than empty. */
  loaded?: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}) {
  const { records } = useMemo(() => buildTrajectory(events), [events]);
  const [selected, setSelected] = useQueryParam("record");
  const [turns, setTurns] = useState(false);
  const [calls, setCalls] = useState(false);
  const [query, setQuery] = useState("");
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(WINDOW);
  const [width, setWidth] = useState<number | null>(null);
  const [tab, setTab] = useState("Summary");
  const rows = useMemo(
    () => ledgerRows(records, { turns, calls, query, flipped }),
    [records, turns, calls, query, flipped],
  );

  const selection = useMemo((): Selection | null => {
    if (!selected) return null;
    const request = /^request:(\d+)$/.exec(selected);
    if (request) {
      const reply = records.find((r) => r.kind === "assistant" && r.request === Number(request[1]));
      return reply?.kind === "assistant" ? { type: "request", reply } : null;
    }
    const record = records.find((r) => r.id === selected);
    return record ? { type: "record", record } : null;
  }, [records, selected]);

  // Follow new rows while the user is at the bottom; open at the tail.
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following.current && !selected && rows.length > 0) el.scrollTop = el.scrollHeight;
  }, [rows, selected]);

  // Bring a record chosen from elsewhere, such as Inspect, into view.
  useEffect(() => {
    if (!selected) return;
    const row = scroller.current?.querySelector(`[data-id="${CSS.escape(rowId(selected) ?? "")}"]`);
    if (row && "scrollIntoView" in row) row.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const flip = (key: string) =>
    setFlipped((all) => {
      const next = new Set(all);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const activeTurn =
    selection?.type === "request" ? selection.reply.turn : (selection?.record.turn ?? null);

  // The latest rows, reaching back far enough to hold the selected one.
  const target = rowId(selected);
  const selectedIndex = rows.findIndex((r) => r.type === "record" && r.record.id === target);
  const tail = Math.max(0, rows.length - limit);
  const from = selectedIndex === -1 ? tail : Math.min(tail, selectedIndex);
  const shown = rows.slice(from);

  return (
    <section aria-label="Trajectory" className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div
        role="toolbar"
        aria-label="Trajectory toolbar"
        className="flex items-center gap-1 border-b px-1 py-1"
      >
        <FoldButton
          label="Turns"
          folded={turns}
          onToggle={() => {
            setTurns((v) => !v);
            setFlipped(new Set());
          }}
        />
        <FoldButton
          label="Calls"
          folded={calls}
          onToggle={() => {
            setCalls((v) => !v);
            setFlipped(new Set());
          }}
        />
        <label className="ml-auto flex h-6 w-48 items-center gap-1 rounded-md border bg-background px-1.5 text-xs">
          <SearchIcon aria-hidden className="size-3 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search trajectory"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK;
          }}
          className="min-h-0 min-w-0 flex-1 overflow-auto [container-type:inline-size]"
        >
          {(from > 0 || hasOlder) && (
            <p className="py-2 text-center">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={() => (from > 0 ? setLimit((n) => n + WINDOW) : onLoadOlder())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {loadingOlder ? "Loading earlier history…" : "Load earlier history"}
              </button>
            </p>
          )}
          {records.length === 0 ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              {loaded
                ? "No records yet. The trajectory fills in once the agent has run a turn."
                : "Loading trajectory…"}
            </p>
          ) : (
            <table aria-label="Trajectory ledger" className="w-full table-fixed border-collapse">
              <tbody>
                {shown.map((row) =>
                  row.type === "record" ? (
                    <RecordRow
                      key={row.key}
                      row={row}
                      selected={selected}
                      activeTurn={activeTurn}
                      onSelect={setSelected}
                      onFlip={flip}
                    />
                  ) : (
                    <SummaryRow key={row.key} row={row} onOpen={() => flip(row.key)} />
                  ),
                )}
              </tbody>
            </table>
          )}
        </div>
        {selection && (
          <RecordInspector
            selection={selection}
            records={records}
            tab={tab}
            onTab={setTab}
            width={width}
            onWidth={setWidth}
            onSelect={setSelected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </section>
  );
}
