import { describe, expect, it } from "vitest";
import { buildTrajectory, replyDuration } from "../../model/build-trajectory";
import {
  buildTimeline,
  commitRange,
  domainOf,
  focusIds,
  panViewport,
  revealSpan,
  type TimelineModel,
  tooltipLabel,
  zoomViewport,
} from "../../model/timeline";
import { session } from "../fixture";

const records = () => buildTrajectory(session()).records;
const model = (mode: "sequence" | "duration"): TimelineModel => {
  const built = buildTimeline(records(), mode);
  if (!built) throw new Error("no timeline");
  return built;
};

describe("buildTimeline", () => {
  it("gives every record one equal slot in its lane, in order", () => {
    const m = model("sequence");
    expect(m.start).toBe(0);
    expect(m.end).toBe(9);
    expect(m.spans.map((s) => `${s.kind}:${s.lane}:${s.start}-${s.end}`)).toEqual([
      "system:0:0-1",
      "user:0:1-2",
      "context:0:2-3",
      "assistant:1:3-4",
      "tool:2:4-5",
      "tool:2:5-6",
      "assistant:1:6-7",
      "user:0:7-8",
      "assistant:1:8-9",
    ]);
  });

  it("marks where each turn begins, not counting the opening prompt", () => {
    expect(model("sequence").turnBoundaries).toEqual([
      { turn: 1, time: 1 },
      { turn: 2, time: 7 },
    ]);
  });

  it("uses recorded times with the idle gaps between operations removed", () => {
    const m = model("duration");
    const tool = m.spans.find((s) => s.id === "tool:t1");
    const reply = m.spans.find((s) => s.id === "reply:1");
    // The reply ran 900 ms from its step's start.
    expect(reply && reply.end - reply.start).toBe(900);
    expect(tool && tool.end - tool.start).toBe(80);
    // Nothing is left between the end of one span and the start of the next.
    const sorted = [...m.spans].sort((a, b) => a.start - b.start || a.end - b.end);
    let covered = sorted[0].end;
    for (const span of sorted.slice(1)) {
      expect(span.start).toBeLessThanOrEqual(covered);
      covered = Math.max(covered, span.end);
    }
  });

  it("flags failed calls and splits a reply's wait from its generation", () => {
    const m = model("sequence");
    expect(m.spans.find((s) => s.id === "tool:t2")?.isError).toBe(true);
    expect(m.spans.find((s) => s.id === "reply:1")).toMatchObject({
      ttftMs: 600,
      decodingMs: 300,
      durationMs: 900,
    });
  });

  it("has no model without records", () => {
    expect(buildTimeline([], "sequence")).toBeNull();
  });
});

describe("focusIds", () => {
  it("keeps every span touching the range, inclusive at both ends", () => {
    const m = model("sequence");
    expect([...focusIds(m, { start: 4.5, end: 5.5 })]).toEqual(["tool:t1", "tool:t2"]);
    expect([...focusIds(m, { start: 5, end: 5 })]).toEqual(["tool:t1", "tool:t2"]);
  });
});

describe("viewport", () => {
  const m = model("sequence");

  it("zooms in around the pointer", () => {
    const next = zoomViewport(m, "sequence", null, 0.5, -300);
    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.end - next.start).toBeCloseTo(9 * Math.exp(-0.45));
    expect((next.start + next.end) / 2).toBeCloseTo(4.5);
  });

  it("stops zooming in at four operations and stays inside the domain", () => {
    const next = zoomViewport(m, "sequence", { start: 0, end: 5 }, 0, -5_000);
    expect(next).toEqual({ start: 0, end: 4 });
  });

  it("returns to the full view when zoomed all the way out", () => {
    expect(zoomViewport(m, "sequence", { start: 2, end: 6 }, 0.5, 5_000)).toBeNull();
  });

  it("pans within the domain", () => {
    const domain = domainOf(m, { start: 2, end: 6 });
    expect(panViewport(m, domain, 2, -0.25)).toEqual({ start: 3, end: 7 });
    expect(panViewport(m, domain, 2, 10)).toEqual({ start: 0, end: 4 });
    expect(panViewport(m, domain, 2, -10)).toEqual({ start: 5, end: 9 });
  });

  it("slides the view just far enough to show a selected span", () => {
    const span = m.spans[7];
    expect(revealSpan(m, { start: 0, end: 4 }, span)).toEqual({ start: 4, end: 8 });
    expect(revealSpan(m, { start: 6, end: 9 }, span)).toEqual({ start: 6, end: 9 });
    expect(revealSpan(m, null, span)).toBeNull();
  });

  it("orders a dragged range and widens a tiny one to one operation", () => {
    const domain = domainOf(m, null);
    expect(commitRange(m, domain, 6, 2)).toEqual({ start: 2, end: 6 });
    expect(commitRange(m, domain, 4, 4.1)).toEqual({ start: 3.55, end: 4.55 });
  });
});

describe("tooltipLabel", () => {
  it("names the kind, its times and its split", () => {
    const span = model("sequence").spans.find((s) => s.id === "reply:1");
    if (!span) throw new Error("no span");
    const lines = tooltipLabel(span).split("\n");
    expect(lines[0]).toBe("ASSISTANT");
    expect(lines[1]).toContain("→");
    expect(lines[2]).toBe("Total 900 ms · TTFT 600 ms · Decoding 300 ms");
  });

  it("is only the kind when no time was recorded", () => {
    const span = model("sequence").spans[0];
    expect(tooltipLabel({ ...span, startedAt: null, durationMs: null })).toBe("SYSTEM");
  });
});

describe("replyDuration", () => {
  it("is model time, not the whole step with its tools", () => {
    const reply = records().find((r) => r.kind === "assistant");
    if (reply?.kind !== "assistant") throw new Error("no reply");
    expect(replyDuration(reply)).toBe(900);
    expect(replyDuration({ ...reply, firstTokenMs: null, generationMs: null })).toBe(1_190);
  });
});
