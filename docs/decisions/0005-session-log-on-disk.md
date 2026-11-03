# 0005. Persist each session as an append-only JSON Lines log

- **Status:** Proposed
- **Date:** 2026-11-03
- **PRD:** §6.1 Sessions and resume, §6.2 Host server, §6.2 Live session
  view, §8 Architecture (Session logs)

## Context

Issue #87 requires that session events survive a server restart and that
a browser reconnecting after one sees every event once, in order. PRD §6.1
describes a session as "an append-only log of messages, tool calls and
results", and §8 draws session logs as a store separate from SQLite.
Resuming a session (#88) also needs the model conversation (including
thinking and tool blocks) and the file baselines that "Revert all" uses.

## Decision

- Each session is a file `sessions/<session id>.jsonl` beside the SQLite
  database. One JSON object per line, appended and never rewritten.
- Record kinds: `event` (a `SessionEvent` with its sequence number),
  `message` (a model conversation message, appended when a turn ends
  without failing), `original` (a file's content before the agent's first
  edit) and `originals` (the baselines left after a revert).
- Every published event gets a per-session sequence number, starting at
  1. The WebSocket frame carries it as `seq` beside the event fields.
  `GET /api/sessions/{id}/events?after=N` returns the logged events after
  `N`. The browser applies an event only if its `seq` is newer than the
  last one it applied, so a backlog fetch and live frames can overlap.
- A line that cannot be parsed (a write cut off by a crash) is skipped.
- When a session is opened and its log ends inside a turn, the server
  appends an `error` event saying the turn stopped when the server did.

## Alternatives considered

### Events in a SQLite table

- Pros: one store; transactions.
- Cons: §8 keeps session logs apart from the database; large tool outputs
  would bloat the database that holds projects and settings.
- Rejected because: a plain file per session is simpler to inspect, copy
  and delete, and matches the PRD's architecture.

### Snapshot the whole session state after each turn

- Pros: loading is one read.
- Cons: not append-only; a crash mid-turn loses the turn's events; writes
  grow with session length.
- Rejected because: the PRD asks for an append-only log, and live
  reconnects need events, not snapshots.

## Consequences

- Good: no event is lost or duplicated across a restart or a dropped
  connection; sessions can be replayed for debugging.
- Bad: loading a session reads its whole log; a very long session may
  later need an index or compaction. Pending notes for the model (such as
  "the user reverted your changes") are not persisted.
