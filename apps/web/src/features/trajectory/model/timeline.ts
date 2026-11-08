import { formatClockMs, formatMs } from "@/features/stats/model/build-stats";
import { type RecordKind, replyDuration, type TrajectoryRecord } from "./build-trajectory";

/** Equal slots per operation, or recorded durations without idle gaps. */
export type TimelineMode = "sequence" | "duration";

/** An inclusive interval in the timeline's own units: operations or ms. */
export interface TimeRange {
  start: number;
  end: number;
}

export interface TimelineSpan extends TimeRange {
  id: string;
  kind: RecordKind;
  isError: boolean;
  /** 0 input, 1 model, 2 tools. */
  lane: number;
  startedAt: number | null;
  durationMs: number | null;
  ttftMs: number | null;
  decodingMs: number | null;
}

export interface TimelineModel extends TimeRange {
  spans: TimelineSpan[];
  turnBoundaries: { turn: number; time: number }[];
}

export interface Domain {
  start: number;
  duration: number;
}

/** Fewest operations the sequence view can zoom in to. */
const MIN_ZOOM_OPERATIONS = 4;
/** Shortest span of recorded time, in ms, the duration view can zoom to. */
const MIN_ZOOM_MS = 20;

const laneOf = (kind: RecordKind) => (kind === "tool" ? 2 : kind === "assistant" ? 1 : 0);

function timing(
  record: TrajectoryRecord,
): Pick<TimelineSpan, "startedAt" | "durationMs" | "ttftMs" | "decodingMs" | "isError"> {
  const none = { ttftMs: null, decodingMs: null, isError: false };
  if (record.kind === "assistant") {
    return {
      ...none,
      startedAt: record.startedAt,
      durationMs: replyDuration(record),
      ttftMs: record.generationMs === null ? null : record.firstTokenMs,
      decodingMs: record.firstTokenMs === null ? null : record.generationMs,
    };
  }
  if (record.kind === "tool") {
    return {
      ...none,
      startedAt: record.startedAt,
      durationMs:
        record.startedAt !== null && record.endedAt !== null
          ? Math.max(0, record.endedAt - record.startedAt)
          : null,
      isError: record.status === "failed",
    };
  }
  return { ...none, startedAt: record.at, durationMs: null };
}

/** The earliest span of each turn, leaving out the session's opening prompt. */
function boundaries(records: TrajectoryRecord[], spans: TimelineSpan[]) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const first = new Map<number, number>();
  for (const span of spans) {
    const record = byId.get(span.id);
    if (!record || record.turn === null || record.preview === "Initial System Prompt") continue;
    first.set(record.turn, Math.min(first.get(record.turn) ?? span.start, span.start));
  }
  return [...first].map(([turn, time]) => ({ turn, time }));
}

/** The session's records as bars in three lanes. */
export function buildTimeline(
  records: TrajectoryRecord[],
  mode: TimelineMode,
): TimelineModel | null {
  const raw = records.flatMap((record, index): TimelineSpan[] => {
    const times = timing(record);
    const base = { id: record.id, kind: record.kind, lane: laneOf(record.kind), ...times };
    if (mode === "sequence") return [{ ...base, start: index, end: index + 1 }];
    if (times.startedAt === null) return [];
    return [
      {
        ...base,
        start: times.startedAt,
        end: times.startedAt + Math.max(0, times.durationMs ?? 0),
      },
    ];
  });
  if (raw.length === 0) return null;

  let spans = raw;
  if (mode === "duration") {
    // Gaps where nothing ran are cut out, so short work stays visible.
    const removed = new Map<TimelineSpan, number>();
    let idle = 0;
    let covered: number | null = null;
    for (const span of [...raw].sort((a, b) => a.start - b.start || a.end - b.end)) {
      if (covered !== null && span.start > covered) idle += span.start - covered;
      removed.set(span, idle);
      covered = covered === null ? span.end : Math.max(covered, span.end);
    }
    spans = raw.map((span) => {
      const offset = removed.get(span) ?? 0;
      return { ...span, start: span.start - offset, end: span.end - offset };
    });
  }
  return {
    start: Math.min(...spans.map((s) => s.start)),
    end: Math.max(...spans.map((s) => s.end)),
    spans,
    turnBoundaries: boundaries(records, spans),
  };
}

/** The records active at any point inside an inclusive range. */
export function focusIds(model: TimelineModel, range: TimeRange): Set<string> {
  return new Set(
    model.spans.filter((s) => s.start <= range.end && s.end >= range.start).map((s) => s.id),
  );
}

/** The span at a time, or the closest one to it. */
export function nearestSpan(model: TimelineModel, time: number): TimelineSpan {
  const distance = (span: TimelineSpan) =>
    time < span.start ? span.start - time : time > span.end ? time - span.end : 0;
  return model.spans.reduce((best, span) => (distance(span) < distance(best) ? span : best));
}

const fullDuration = (model: TimelineModel) => Math.max(1, model.end - model.start);

/** The visible part of the timeline: all of it, or the zoomed viewport. */
export function domainOf(model: TimelineModel, viewport: TimeRange | null): Domain {
  if (!viewport) return { start: model.start, duration: fullDuration(model) };
  const duration = Math.min(fullDuration(model), Math.max(1, viewport.end - viewport.start));
  return {
    start: Math.min(Math.max(viewport.start, model.start), model.end - duration),
    duration,
  };
}

/** The viewport after a wheel step, holding the point under the pointer
 * still; `null` once zoomed out to everything. */
export function zoomViewport(
  model: TimelineModel,
  mode: TimelineMode,
  viewport: TimeRange | null,
  anchor: number,
  deltaY: number,
): TimeRange | null {
  const full = fullDuration(model);
  const domain = domainOf(model, viewport);
  const minimum = Math.min(mode === "sequence" ? MIN_ZOOM_OPERATIONS : MIN_ZOOM_MS, full);
  const duration = Math.min(full, Math.max(minimum, domain.duration * Math.exp(deltaY * 0.0015)));
  if (duration >= full * 0.999) return null;
  const point = domain.start + anchor * domain.duration;
  const start = Math.min(Math.max(point - anchor * duration, model.start), model.end - duration);
  return { start, end: start + duration };
}

/** The viewport after a drag of `delta` track widths from `anchorStart`. */
export function panViewport(
  model: TimelineModel,
  domain: Domain,
  anchorStart: number,
  delta: number,
): TimeRange {
  const start = Math.min(
    Math.max(anchorStart - delta * domain.duration, model.start),
    model.end - domain.duration,
  );
  return { start, end: start + domain.duration };
}

/** A zoomed viewport moved just far enough to show a span. */
export function revealSpan(
  model: TimelineModel,
  viewport: TimeRange | null,
  span: TimelineSpan,
): TimeRange | null {
  if (!viewport) return null;
  if (span.end > viewport.start && span.start < viewport.end) return viewport;
  const duration = Math.max(1, viewport.end - viewport.start);
  const desired = span.end <= viewport.start ? span.start : span.end - duration;
  const start = Math.min(
    Math.max(desired, model.start),
    Math.max(model.start, model.end - duration),
  );
  return { start, end: start + duration };
}

/** The range a drag selects: ordered, and at least one operation wide. */
export function commitRange(
  model: TimelineModel,
  domain: Domain,
  anchorTime: number,
  pointTime: number,
): TimeRange {
  const start = Math.min(anchorTime, pointTime);
  const end = Math.max(anchorTime, pointTime);
  const minimum = Math.min(domain.duration, fullDuration(model) / model.spans.length);
  if (end - start >= minimum) return { start, end };
  const left = Math.min(
    Math.max((start + end) / 2 - minimum / 2, model.start),
    model.end - minimum,
  );
  return { start: left, end: left + minimum };
}

const clock = (ts: number) => formatClockMs(ts, true).slice(6);

/** A bar's hover detail: its kind, when it ran and how long it took. */
export function tooltipLabel(span: TimelineSpan): string {
  const lines = [span.kind.toUpperCase()];
  if (span.startedAt !== null) {
    lines.push(
      span.durationMs === null
        ? `Started ${clock(span.startedAt)}`
        : `${clock(span.startedAt)} → ${clock(span.startedAt + span.durationMs)}`,
    );
  }
  const timing = [
    ...(span.durationMs === null ? [] : [`Total ${formatMs(span.durationMs)}`]),
    ...(span.ttftMs === null || span.decodingMs === null
      ? []
      : [`TTFT ${formatMs(span.ttftMs)}`, `Decoding ${formatMs(span.decodingMs)}`]),
  ].join(" · ");
  if (timing !== "") lines.push(timing);
  return lines.join("\n");
}
