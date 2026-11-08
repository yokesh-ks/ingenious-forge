import { describe, expect, it } from "vitest";
import {
  cacheHitPercent,
  contextPercent,
  formatClock,
  formatTokens,
  formatTps,
  totalTokens,
} from "../../model/format";

describe("formatTokens", () => {
  it("shows small counts whole and larger ones as K or M", () => {
    expect(formatTokens(517)).toBe("517");
    expect(formatTokens(12_240)).toBe("12.2K");
    expect(formatTokens(59_900)).toBe("59.9K");
    expect(formatTokens(253_400)).toBe("253K");
    expect(formatTokens(1_240_000)).toBe("1.2M");
  });
});

describe("formatTps", () => {
  it("rounds from ten up and keeps one decimal below", () => {
    expect(formatTps(160.6)).toBe("161");
    expect(formatTps(7.25)).toBe("7.3");
    expect(formatTps(-1)).toBe("0");
  });
});

describe("cacheHitPercent", () => {
  it("is the share of prompt tokens served from cache", () => {
    expect(cacheHitPercent({ input: 60, output: 5, cache_read: 40, cache_write: 0 })).toBe("40");
    expect(cacheHitPercent({ input: 0, output: 5, cache_read: 50, cache_write: 0 })).toBe("100");
  });

  it("never rounds a partial hit up to 100", () => {
    expect(cacheHitPercent({ input: 1, output: 0, cache_read: 999, cache_write: 0 })).toBe("99.9");
    expect(cacheHitPercent({ input: 1, output: 0, cache_read: 99_999, cache_write: 0 })).toBe(
      "99.999",
    );
  });

  it("has no value without prompt tokens", () => {
    expect(cacheHitPercent({ input: 0, output: 5, cache_read: 0, cache_write: 0 })).toBeNull();
  });
});

describe("totals", () => {
  it("adds every prompt bucket and the output", () => {
    expect(totalTokens({ input: 1, output: 2, cache_read: 3, cache_write: 4 })).toBe(10);
  });

  it("gives the context use as a whole percent when the window is known", () => {
    expect(contextPercent(10_240, 128_000)).toBe(8);
    expect(contextPercent(10, 128_000)).toBe(1);
    expect(contextPercent(10, null)).toBeNull();
  });
});

describe("formatClock", () => {
  it("shows a time today as HH:MM", () => {
    const now = new Date(2026, 10, 8, 18, 0).getTime();
    expect(formatClock(new Date(2026, 10, 8, 9, 5).getTime(), now)).toBe("09:05");
  });

  it("adds the date for an earlier day", () => {
    const now = new Date(2026, 10, 8, 18, 0).getTime();
    expect(formatClock(new Date(2026, 10, 6, 14, 34).getTime(), now)).toBe("Nov 6, 14:34");
  });
});
