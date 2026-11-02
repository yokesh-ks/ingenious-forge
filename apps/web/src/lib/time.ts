const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hours ago", "yesterday" and so on for a time in epoch milliseconds. */
export function timeAgo(ms: number, now = Date.now()): string {
  const elapsed = now - ms;
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return format.format(-Math.floor(elapsed / size), unit);
  }
  return "just now";
}
