import { SearchIcon } from "lucide-react";
import type { JsonValue } from "@/api/types";

/** The rounded grey box tool cards share. */
export const CARD =
  "overflow-hidden rounded-2xl border border-black/5 bg-muted/50 dark:border-white/5";

/** The pill under a card that will open the call in the Trajectory view
 * (plan step 13); shown now, not yet available. */
export function InspectButton() {
  return (
    <button
      type="button"
      disabled
      title="Inspect opens in a later version"
      className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-black/10 bg-background px-2 py-0.5 text-[11px] leading-4 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10"
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
