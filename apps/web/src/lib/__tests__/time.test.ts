import { describe, expect, it } from "vitest";
import { timeAgo } from "../time";

const now = Date.UTC(2026, 10, 2, 12, 0, 0);

describe("timeAgo", () => {
  it("says just now for the last minute", () => {
    expect(timeAgo(now - 30_000, now)).toBe("just now");
  });

  it("uses the largest whole unit", () => {
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(timeAgo(now - 86_400_000, now)).toBe("yesterday");
    expect(timeAgo(now - 40 * 86_400_000, now)).toBe("last month");
  });
});
