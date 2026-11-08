import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import type { JsonValue } from "@/api/types";
import { cn } from "@/lib/utils";

const STRING = "text-red-700 dark:text-red-300";
const KEY = "text-violet-700 dark:text-violet-300";

/** A value on one line, shortened, for a folded entry. */
function inline(value: JsonValue, depth = 0): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (depth > 1) return Array.isArray(value) ? "[…]" : "{…}";
  if (Array.isArray(value)) {
    const items = value.slice(0, 5).map((v) => inline(v, depth + 1));
    return `[${items.join(", ")}${value.length > 5 ? ", …" : ""}]`;
  }
  const entries = Object.entries(value).slice(0, 5);
  const more = Object.keys(value).length > entries.length ? ", …" : "";
  return `{${entries.map(([k, v]) => `${k}: ${inline(v, depth + 1)}`).join(", ")}${more}}`;
}

function Scalar({ value }: { value: JsonValue }) {
  if (typeof value === "string") {
    return (
      <span className={cn(STRING, "whitespace-pre-wrap break-all")}>{JSON.stringify(value)}</span>
    );
  }
  return <span className="text-blue-700 dark:text-blue-300">{JSON.stringify(value)}</span>;
}

/** One entry: a scalar on its line, or a folded object or array that opens
 * in place. */
function Entry({ name, value, last }: { name: string | null; value: JsonValue; last: boolean }) {
  const [open, setOpen] = useState(false);
  const nested = value !== null && typeof value === "object";
  const label = name === null ? null : <span className={KEY}>{name}:</span>;
  const comma = last ? "" : ",";
  if (!nested) {
    return (
      <div className="pl-3">
        {label}
        <Scalar value={value} />
        {comma}
      </div>
    );
  }
  return (
    <div className="pl-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-ml-3 inline-flex max-w-full items-start text-left"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn("mt-0.5 size-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        {label}
        {!open && <span className="truncate text-muted-foreground">{inline(value)}</span>}
      </button>
      {open && <Body value={value} />}
      {!open && comma}
    </div>
  );
}

function Body({ value }: { value: JsonValue }) {
  if (value === null || typeof value !== "object") return <Scalar value={value} />;
  const entries: [string | null, JsonValue][] = Array.isArray(value)
    ? value.map((v) => [null, v])
    : Object.entries(value);
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <>
      <div>{open}</div>
      {entries.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: entries keep their order
        <Entry key={i} name={k} value={v} last={i === entries.length - 1} />
      ))}
      <div>{close}</div>
    </>
  );
}

/** A JSON value as a tree: the top level open, nested values folded on
 * one line until opened. */
export default function JsonTree({ value, label }: { value: JsonValue; label: string }) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 min-w-0 overflow-x-auto border-0 p-0 font-mono text-[11px] leading-[18px]"
    >
      <Body value={value} />
    </fieldset>
  );
}
