import { ChevronDownIcon, ChevronRightIcon, CrosshairIcon, FilterIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SessionEnvelope } from "@/api/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ancestorsOf,
  branches,
  chatRows,
  filterRows,
  type LogMode,
  type LogRow,
  logTime,
  rawRows,
  rowForChat,
  visibleRows,
} from "../model/session-log";
import { type ChatTarget, pickInChat, revealInChat } from "./chat-locate";
import RawDataTree from "./RawDataTree";

const ROW_HEIGHT = 30;
const OVERSCAN = 12;
/** Pixels from the bottom that still count as following new rows. */
const TAIL_SLACK = 40;

const clampShare = (share: number) => Math.min(0.8, Math.max(0.15, share));

const CELL =
  "box-border h-[30px] truncate border-b-[0.5px] border-border px-2 py-1 whitespace-nowrap";
const CONTROL = "hover:text-primary disabled:opacity-60";

function TypeFilter({
  value,
  types,
  onApply,
}: {
  value: string;
  types: string[];
  onApply: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const query = draft.trim().toLowerCase();
  const suggestions = types.filter((type) => type.toLowerCase().includes(query)).slice(0, 40);
  const apply = (next: string) => {
    onApply(next.trim());
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter types"
          aria-pressed={value !== ""}
          className={cn(
            "inline-flex rounded-[3px] p-0.5 hover:bg-muted hover:text-primary",
            value !== "" && "bg-muted text-primary",
          )}
        >
          <FilterIcon aria-hidden className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[290px] flex-col gap-1.5 p-2.5 text-[11px]">
        <input
          // biome-ignore lint/a11y/noAutofocus: opening the filter is asking to type
          autoFocus
          aria-label="Type keyword"
          placeholder="Type a fragment, e.g. delta"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply(draft);
            }
          }}
          className="box-border w-full rounded border-[0.5px] border-border bg-transparent px-1.5 py-[5px] outline-none"
        />
        <p className="m-0 text-muted-foreground">
          Contains matching (*keyword*). Enter confirms; Esc cancels.
        </p>
        <div role="listbox" aria-label="Type suggestions" className="max-h-[180px] overflow-auto">
          {suggestions.length === 0 ? (
            <p className="m-0 text-muted-foreground">
              No suggestions. You can still apply this keyword.
            </p>
          ) : (
            suggestions.map((type) => (
              <button
                key={type}
                type="button"
                role="option"
                aria-selected={type === draft}
                onClick={() => setDraft(type)}
                className="block w-full truncate rounded px-1.5 py-1 text-left hover:bg-muted hover:text-primary"
              >
                {type}
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="rounded border-[0.5px] border-border px-1.5 py-[3px]"
            onClick={() => apply("")}
          >
            Clear
          </button>
          <button
            type="button"
            className="rounded border-[0.5px] border-border px-1.5 py-[3px]"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded border-[0.5px] border-border px-1.5 py-[3px]"
            onClick={() => apply(draft)}
          >
            Apply filter
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The session's recorded events, as the raw log or grouped by message. */
export default function SessionLogTab({
  events,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: {
  events: SessionEnvelope[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}) {
  const [mode, setMode] = useState<LogMode>("raw");
  const [fragment, setFragment] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const [detailsShare, setDetailsShare] = useState(0.4);
  const root = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  const all = useMemo(() => (mode === "raw" ? rawRows(events) : chatRows(events)), [events, mode]);
  const filtered = useMemo(() => filterRows(all, fragment), [all, fragment]);
  const shown = useMemo(() => visibleRows(filtered.rows, collapsed), [filtered.rows, collapsed]);
  const parents = useMemo(() => branches(filtered.rows), [filtered.rows]);
  const types = useMemo(() => [...new Set(all.map((row) => row.type))].sort(), [all]);
  const record = all.find((row) => row.key === selected);

  const reset = () => {
    setSelected(null);
    setCollapsed(new Set());
    setScrollTop(0);
    if (scroller.current) scroller.current.scrollTop = 0;
  };

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setHeight(element.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: new rows are what moves the tail
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [shown.length]);

  const revealRow = (key: string, rows: LogRow[]) => {
    const row = rows.find((r) => r.key === key);
    const ancestors = new Set(ancestorsOf(rows, row).map((a) => a.key));
    const open = new Set([...collapsed].filter((k) => !ancestors.has(k)));
    setCollapsed(open);
    setSelected(key);
    following.current = false;
    const index = visibleRows(rows, open).findIndex((r) => r.key === key);
    const element = scroller.current;
    if (element && index !== -1) {
      element.scrollTop = Math.max(0, (index - 3) * ROW_HEIGHT);
      setScrollTop(element.scrollTop);
    }
  };

  /** What a pick does, always against the table as it stands now. */
  const onPicked = useRef<(target: ChatTarget) => boolean>(() => false);
  onPicked.current = (target) => {
    const row = rowForChat(all, target);
    if (!row) {
      setNotice("No matching record in this table. Pick another element or press Esc to cancel.");
      return false;
    }
    setNotice(null);
    setPicking(false);
    setFragment("");
    revealRow(row.key, all);
    return true;
  };

  useEffect(() => {
    if (!picking) return;
    const stop = pickInChat(
      (target) => onPicked.current(target),
      () => {
        setPicking(false);
        setNotice(null);
      },
    );
    if (!stop) {
      setPicking(false);
      setNotice("Open this session in the main chat before picking.");
      return;
    }
    setNotice("Hover in the main chat to preview, then click to select. Esc cancels.");
    return stop;
  }, [picking]);

  const select = (row: LogRow) => {
    setSelected(row.key);
    if (mode === "raw" || row.turn !== null) revealInChat({ callId: row.callId, turn: row.turn });
  };
  const toggle = (key: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // The table scrolls beneath the header and the groups holding the top row.
  const viewport = height || 800;
  const probe = Math.floor(scrollTop / ROW_HEIGHT);
  const pinned = ancestorsOf(filtered.rows, shown[probe]).filter(
    (row) => shown.indexOf(row) < probe,
  );
  const first = Math.max(0, probe - OVERSCAN);
  const last = Math.min(shown.length, probe + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN);
  const showTime = mode === "raw";
  const columns = showTime ? 5 : 4;
  const count = fragment ? `${filtered.matches.size} / ${all.length}` : all.length;

  const rowOf = (row: LogRow, stuck = false) => {
    const branch = parents.has(row.key);
    const closed = collapsed.has(row.key);
    const context = !filtered.matches.has(row.key);
    return (
      <tr
        key={stuck ? `pin:${row.key}` : row.key}
        data-log-row={row.key}
        aria-selected={row.key === selected}
        className={cn(
          "hover:bg-muted/60",
          row.key === selected && "bg-foreground/[0.06]",
          stuck && "bg-background hover:bg-background",
          context && "text-muted-foreground/60",
        )}
      >
        <td className={CELL} title={row.index}>
          {row.index}
        </td>
        <td className={CELL} style={{ paddingLeft: 8 + row.depth * 12 }}>
          <span className="flex min-w-0 items-center">
            {branch ? (
              <button
                type="button"
                aria-label={closed ? "Expand children" : "Collapse children"}
                aria-expanded={!closed}
                onClick={() => toggle(row.key)}
                className="w-4 flex-none"
              >
                {closed ? (
                  <ChevronRightIcon aria-hidden className="size-3" />
                ) : (
                  <ChevronDownIcon aria-hidden className="size-3" />
                )}
              </button>
            ) : (
              <span className="w-4 flex-none" />
            )}
            <button
              type="button"
              title={context ? "Parent context of a matching record" : undefined}
              onClick={() => select(row)}
              className="truncate text-left"
            >
              {row.type}
            </button>
          </span>
        </td>
        <td className={CELL}>{row.location}</td>
        {showTime && <td className={CELL}>{logTime(row.ts)}</td>}
        <td className={CELL}>
          <button
            type="button"
            onClick={() => select(row)}
            className="block w-full truncate text-left"
          >
            {row.preview}
          </button>
        </td>
      </tr>
    );
  };

  const title = mode === "raw" ? "Raw log" : "Chat group";

  return (
    <section
      ref={root}
      aria-label={title}
      className="flex h-full min-h-0 min-w-0 flex-col text-[11px]"
    >
      <div className="flex flex-none items-center gap-2 px-2 py-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <select
            aria-label="Presentation"
            value={mode}
            onChange={(event) => {
              setPicking(false);
              setNotice(null);
              setFragment("");
              reset();
              following.current = true;
              setMode(event.target.value as LogMode);
            }}
            className="bg-background px-1 py-0.5"
          >
            <option value="raw">Raw log</option>
            <option value="chat">Chat group</option>
          </select>
          <button
            type="button"
            aria-label="Pick an element in the chat view"
            aria-pressed={picking}
            title={picking ? "Cancel picking (Esc)" : "Pick an element in the chat view"}
            onClick={() => {
              setNotice(null);
              setPicking((value) => !value);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded p-[3px] hover:bg-muted hover:text-primary",
              picking && "bg-muted text-primary",
            )}
          >
            <CrosshairIcon aria-hidden className="size-4" />
          </button>
          <span>· {count}</span>
        </span>
        {hasOlder && (
          <button type="button" disabled={loadingOlder} className={CONTROL} onClick={onLoadOlder}>
            {loadingOlder ? "Loading…" : "Load earlier"}
          </button>
        )}
        <button
          type="button"
          className={CONTROL}
          onClick={() => {
            following.current = true;
            const element = scroller.current;
            if (element) element.scrollTop = element.scrollHeight;
          }}
        >
          Follow latest
        </button>
      </div>
      {notice && (
        <div
          role="status"
          className="flex-none border-b-[0.5px] border-border px-2 py-1 text-muted-foreground"
        >
          {notice}
        </div>
      )}
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          setScrollTop(element.scrollTop);
          following.current =
            element.scrollHeight - element.clientHeight - element.scrollTop <= TAIL_SLACK;
        }}
        className="min-h-0 flex-1 overflow-auto [overflow-anchor:none]"
      >
        <table
          aria-label={title}
          aria-rowcount={shown.length + 1}
          className="w-full min-w-[660px] table-fixed border-collapse font-mono"
        >
          <colgroup>
            <col className="w-16" />
            <col className="w-[190px]" />
            <col className="w-[65px]" />
            {showTime && <col className="w-[100px]" />}
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              <th className={cn(CELL, "text-left font-normal")}>Index</th>
              <th className={cn(CELL, "text-left font-normal")}>
                <span className="inline-flex items-center gap-1">
                  Type
                  <TypeFilter
                    value={fragment}
                    types={types}
                    onApply={(next) => {
                      setFragment(next);
                      reset();
                    }}
                  />
                </span>
              </th>
              <th className={cn(CELL, "text-left font-normal")}>T/S</th>
              {showTime && <th className={cn(CELL, "text-left font-normal")}>Time (UTC)</th>}
              <th className={cn(CELL, "text-left font-normal")}>Data</th>
            </tr>
            {pinned.map((row) => rowOf(row, true))}
          </thead>
          <tbody>
            {first > 0 && (
              <tr aria-hidden>
                <td colSpan={columns} style={{ height: first * ROW_HEIGHT, padding: 0 }} />
              </tr>
            )}
            {shown.slice(first, last).map((row) => rowOf(row))}
            {last < shown.length && (
              <tr aria-hidden>
                <td
                  colSpan={columns}
                  style={{ height: (shown.length - last) * ROW_HEIGHT, padding: 0 }}
                />
              </tr>
            )}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="m-0 p-3 text-center text-muted-foreground">No records</p>
        )}
      </div>
      {selected !== null && (
        <div
          style={{ flexBasis: `${detailsShare * 100}%` }}
          className="flex max-h-[80%] flex-none flex-col overflow-hidden"
        >
          {/* biome-ignore lint/a11y/useSemanticElements: a focusable splitter, which <hr> cannot be */}
          <div
            role="separator"
            aria-label="Resize raw data panel"
            aria-orientation="horizontal"
            aria-valuenow={Math.round(detailsShare * 100)}
            tabIndex={0}
            aria-valuemin={15}
            aria-valuemax={80}
            onKeyDown={(event) => {
              const next = {
                ArrowUp: detailsShare + 0.05,
                ArrowDown: detailsShare - 0.05,
                Home: 0.15,
                End: 0.8,
              }[event.key];
              if (next === undefined) return;
              event.preventDefault();
              setDetailsShare(clampShare(next));
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              const onMove = (e: PointerEvent) => {
                const box = root.current?.getBoundingClientRect();
                if (box?.height) {
                  setDetailsShare(
                    Math.min(0.8, Math.max(0.1, (box.bottom - e.clientY) / box.height)),
                  );
                }
              };
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
            className="h-[5px] flex-none cursor-row-resize touch-none bg-border select-none hover:bg-primary focus-visible:bg-primary"
          />
          <div className="flex flex-none items-center justify-between px-2 py-1">
            <span>Raw data</span>
            <button type="button" className={CONTROL} onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {record ? (
              <RawDataTree key={record.key} value={record.value} label="Raw data" />
            ) : (
              <p className="m-0 text-muted-foreground">
                This record was removed or settled. Select a current record.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
