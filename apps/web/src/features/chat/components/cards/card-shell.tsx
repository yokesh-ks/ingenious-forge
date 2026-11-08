import { SearchIcon } from "lucide-react";
import type { JsonValue } from "@/api/types";
import { setQueryParams } from "@/lib/router";

/** The rounded grey box tool cards share. */
export const CARD =
  "overflow-hidden rounded-2xl border border-black/5 bg-muted/50 dark:border-white/5";

/** The pill under a card that opens the call in the Trajectory view,
 * selected in its inspector. */
export function InspectButton({ callId }: { callId: string }) {
  return (
    <button
      type="button"
      title="Open this call in the Trajectory view"
      onClick={() => setQueryParams({ view: "trajectory", record: `tool:${callId}` })}
      className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-black/10 bg-background px-2 py-0.5 text-[11px] leading-4 text-muted-foreground hover:text-foreground dark:border-white/10"
    >
      <SearchIcon aria-hidden className="size-3" />
      Inspect
    </button>
  );
}

/** A string argument or result field, when it is a non-empty string. */
export function field(value: JsonValue | undefined, key: string): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const found = value[key];
    if (typeof found === "string" && found !== "") return found;
  }
  return null;
}

/** The last part of a path. */
export function baseName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}
