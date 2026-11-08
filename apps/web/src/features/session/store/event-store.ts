import type { SessionEnvelope } from "@/api/types";

/**
 * A session's logged events as the browser holds them: a run of the log,
 * ordered by `seq`, with each sequence number once. Pages loaded from the
 * server and live socket frames merge into it in any order.
 */
export interface EventStore {
  events: SessionEnvelope[];
  /** The oldest sequence number held; `null` when empty. */
  firstSeq: number | null;
  /** The newest sequence number held; 0 when empty. */
  lastSeq: number;
  /**
   * The events the last merge added, when they all came after what was
   * held: the view can apply just these. `null` when older events were
   * added, so the view must rebuild from `events`.
   */
  appended: SessionEnvelope[] | null;
}

export const emptyEventStore: EventStore = {
  events: [],
  firstSeq: null,
  lastSeq: 0,
  appended: [],
};

/** Merges `incoming` into `store`, keeping each sequence number once. */
export function mergeEvents(store: EventStore, incoming: SessionEnvelope[]): EventStore {
  // Live frames arrive newest-last, so the common case skips the set of
  // held numbers and stays cheap in long sessions.
  const held = incoming.every((e) => e.seq > store.lastSeq)
    ? new Set<number>()
    : new Set(store.events.map((e) => e.seq));
  const fresh: SessionEnvelope[] = [];
  for (const envelope of incoming) {
    if (held.has(envelope.seq)) continue;
    held.add(envelope.seq);
    fresh.push(envelope);
  }
  if (fresh.length === 0) return { ...store, appended: [] };
  fresh.sort((a, b) => a.seq - b.seq);
  const appendsOnly = fresh[0].seq > store.lastSeq;
  const events = appendsOnly
    ? store.events.concat(fresh)
    : store.events.concat(fresh).sort((a, b) => a.seq - b.seq);
  return {
    events,
    firstSeq: events[0].seq,
    lastSeq: events[events.length - 1].seq,
    appended: appendsOnly ? fresh : null,
  };
}

/**
 * The part of a page that starts with a turn: from its first message the
 * user typed to start one. A page cut in the middle of a turn would show
 * results without their calls and a running turn as idle, so the part
 * before is left for the next older page. A page with no turn start, such
 * as part of one very long turn, is kept whole.
 */
export function startAtTurn(page: SessionEnvelope[]): SessionEnvelope[] {
  const start = page.findIndex((e) => e.type === "user_message" && e.source !== "steering");
  return start > 0 ? page.slice(start) : page;
}
