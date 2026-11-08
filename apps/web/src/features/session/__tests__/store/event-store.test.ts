import { describe, expect, it } from "vitest";
import type { SessionEnvelope } from "@/api/types";
import {
  type EventStore,
  emptyEventStore,
  mergeEvents,
  startAtTurn,
} from "../../store/event-store";

const out = (seq: number, chunk = String(seq)): SessionEnvelope => ({
  seq,
  ts: 0,
  type: "output",
  session_id: "s1",
  chunk,
});
const user = (seq: number, source: "human" | "steering" = "human"): SessionEnvelope => ({
  seq,
  ts: 0,
  type: "user_message",
  session_id: "s1",
  text: `u${seq}`,
  source,
});
const seqs = (store: EventStore) => store.events.map((e) => e.seq);

describe("mergeEvents", () => {
  it("keeps every sequence number once, in order", () => {
    const tail = mergeEvents(emptyEventStore, [out(4), out(5), out(6)]);
    const live = mergeEvents(tail, [out(6), out(7)]);
    const older = mergeEvents(live, [out(2), out(3), out(4)]);
    expect(seqs(older)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("says whether the new events only extend the end", () => {
    const tail = mergeEvents(emptyEventStore, [out(4), out(5)]);
    expect(mergeEvents(tail, [out(5), out(6)]).appended).toEqual([out(6)]);
    expect(mergeEvents(tail, [out(3)]).appended).toBeNull();
    // Nothing new changes nothing.
    const same = mergeEvents(tail, [out(4)]);
    expect(same.events).toBe(tail.events);
    expect(same.appended).toEqual([]);
  });

  it("knows its first and last sequence numbers", () => {
    const store = mergeEvents(emptyEventStore, [out(9), out(3)]);
    expect(store.firstSeq).toBe(3);
    expect(store.lastSeq).toBe(9);
    expect(emptyEventStore.firstSeq).toBeNull();
    expect(emptyEventStore.lastSeq).toBe(0);
  });
});

describe("startAtTurn", () => {
  it("drops events before the page's first typed message", () => {
    expect(startAtTurn([out(1), out(2), user(3), out(4)]).map((e) => e.seq)).toEqual([3, 4]);
  });

  it("does not start at a message typed during a turn", () => {
    expect(startAtTurn([out(1), user(2, "steering"), user(3), out(4)]).map((e) => e.seq)).toEqual([
      3, 4,
    ]);
  });

  it("keeps a page that holds no turn start, such as one long turn", () => {
    expect(startAtTurn([out(1), out(2)]).map((e) => e.seq)).toEqual([1, 2]);
  });
});
