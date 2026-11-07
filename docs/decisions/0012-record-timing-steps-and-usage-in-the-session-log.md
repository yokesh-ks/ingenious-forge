# 0012. Record timing, model steps and token usage in the session log

- **Status:** Proposed
- **Date:** 2026-11-07
- **PRD:** §6.1 Sessions and resume, §6.2 Trajectory view, §6.2 Session
  statistics, §6.2 Typed API, §7 Performance

## Context

PRD §6.2 now asks for a Trajectory view and a Statistics tab. Both
measure a session after the fact: when each event happened, where each
model request (a step, §12) starts and ends, how long it waited for its
first token, how many tokens it used and how much of its prompt came
from the provider's cache. §6.1 now says the session log records these
facts.

The log of [0005](0005-session-log-on-disk.md) records none of them.
`SessionEvent` in `server/crates/api-types` has no timestamp, no event
marks a model request, and the provider clients drop usage:
`openai_compat.rs` does not ask for it (no `stream_options.include_usage`)
and skips usage-only chunks, and `anthropic.rs` and `openai_responses.rs`
ignore the usage fields of `message_start`, `message_delta` and
`response.completed`. Figures that are not logged when they happen cannot
be recovered later, so the log has to change before either view is built.

Three things constrain the change:

- Logs written under 0005 must still open, resume and replay (§7
  Reliability).
- The browser must not compute figures the server can compute once: two
  tabs reading the same events should never disagree.
- Each provider reports usage differently. OpenAI-style `prompt_tokens`
  include cached tokens; Anthropic's `input_tokens` exclude them.

## Decision

Add a server-set `ts` (milliseconds since the Unix epoch) to every
`SessionEnvelope`, and two new `SessionEvent` kinds around each model
request. `StepStarted { step }` is published before the request is sent.
`StepEnded { step, usage, first_token_ms, generation_ms }` is published
when its reply settles or fails. `usage` is
`Usage { input, output, cache_read, cache_write }`, normalized so that
`input` excludes cached tokens, or `None` when the provider reported
nothing.

## Details

- **Where it is stamped.** `ts` is taken in `SessionLog::append_event`
  beside the sequence number, so the log and the WebSocket frame carry the
  same value. `step` counts from 1 within a turn.
- **First token.** `first_token_ms` is the time from `StepStarted` to the
  first streamed text, reasoning or tool-call delta. `generation_ms` runs
  from that delta to the settled reply. Either is `None` when no delta
  arrived.
- **Usage mapping.**

  | Provider client | Source | `input` | `cache_read` | `cache_write` |
  | --- | --- | --- | --- | --- |
  | `anthropic.rs` | `message_start` usage, `message_delta` output | `input_tokens` | `cache_read_input_tokens` | `cache_creation_input_tokens` |
  | `openai_compat.rs` | final chunk, after sending `stream_options.include_usage: true` | `prompt_tokens − cached_tokens` | `prompt_tokens_details.cached_tokens` | 0 |
  | `openai_responses.rs` | `response.completed` | `input_tokens − cached_tokens` | `input_tokens_details.cached_tokens` | 0 |

  An OpenAI-compatible provider that rejects `stream_options` is retried
  once without it, and its steps record `usage: None`.
- **Old logs.** `ts` and the step fields use `#[serde(default)]`. A
  0005-era log opens with `ts` and steps missing. The views show those
  figures as not recorded rather than guessing.
- **Whole-session totals.** The server folds a session's log into
  `SessionStats`, served by `GET /api/sessions/{id}/stats`. The browser
  formats figures; it does not derive them.
- **Paging.** `GET /api/sessions/{id}/events` gains `before=<seq>` and
  `limit=<n>` (bounded on the server) so a long session can open at its
  tail. The existing `after=<seq>` reconnect path is unchanged.

## Alternatives considered

### Compute timing in the browser from arrival times

- Pros: no log or API change.
- Cons: arrival times measure the network and the tab, not the model.
  They are lost on reload and differ between tabs. Token usage is not
  available in the browser at all.
- Rejected because: §6.1 asks for a session that can be measured after
  the fact, and only the server sees the provider's stream and usage.

### Store metrics in a separate SQLite table keyed by session

- Pros: totals are one query; the log format stays as in 0005.
- Cons: two stores must agree, and a crash between the writes leaves them
  apart. Fork and replay would have to copy both. §8 keeps session data in
  the log, apart from the database.
- Rejected because: an extra field on an event already being appended
  needs no second write and stays in order with the events it describes.

### Put timing and usage on the existing `Done` event only

- Pros: the smallest change; no new event kinds.
- Cons: one turn makes several model requests. Per-turn figures cannot be
  split into steps, and a turn that fails mid-way records nothing.
- Rejected because: both views show steps, and a failed step's timing is
  what a user debugging it most needs.

## Consequences

- Good: Trajectory and Statistics read one set of figures computed once
  on the server. Every session logged from now on can be measured after a
  reload, a fork or a restart. Old logs keep working.
- Bad: each envelope grows by a timestamp and each step by two events.
  Providers that report no usage show dashes rather than numbers. The
  `openai_compat.rs` retry without `stream_options` adds a branch to test.
- Follow-up: implement the fields and events in `api-types`, `services`
  and the three provider clients, and regenerate
  `apps/web/src/api/types.ts`. Add `SessionStats` and the `/stats` and
  paging endpoints. Then build the Statistics and Trajectory tabs. Each
  piece needs its own spec (Principle II).
