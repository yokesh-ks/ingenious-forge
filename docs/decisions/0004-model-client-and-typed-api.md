# 0004. Call model providers over HTTP with reqwest and generate the typed API with ts-rs

- **Status:** Proposed
- **Date:** 2026-11-02
- **PRD:** §6.1 Agent loop, §6.1 Models and reasoning effort, §6.2 Typed
  API, §8 Architecture

## Context

Issue #79 is the first story that calls a model and streams its reply to
the browser. That needs three things the workspace does not have: an HTTP
client for the provider's streaming API, a way to generate TypeScript from
the `api-types` crate that CI can check for drift, and a test runner for
the web SPA. Principle VIII asks that each new dependency records the
simpler option and why it falls short.

## Decision

- The `agent` crate calls providers with `reqwest` (rustls, JSON) and
  parses the server-sent event stream itself (`agent::sse`). Providers sit
  behind the `ModelClient` trait; Anthropic is the first adapter.
- `api-types` derives `ts_rs::TS` on every type the browser exchanges
  with the server. A test renders the declarations into
  `apps/web/src/api/types.ts` and fails when the committed file differs;
  `UPDATE_API_TYPES=1 cargo test -p api-types` regenerates it. The `build`
  CI workflow runs it.
- The web SPA is tested with Vitest, Testing Library and jsdom (dev
  dependencies only).

## Alternatives considered

### Raw `hyper` client instead of `reqwest`

- Pros: `hyper` is already in the tree through `axum`.
- Cons: TLS setup, connection pooling, redirects and proxies by hand.
- Rejected because: the extra code buys nothing the product needs.

### A provider SDK crate

- Pros: typed request and response structs.
- Cons: no official Rust SDK exists; community crates lag the API and
  would be a dependency per provider, against the adapter design in §6.1.
- Rejected because: the few fields the agent uses are simpler to own.

### Hand-written TypeScript types

- Pros: no dependency.
- Cons: nothing stops the two sides drifting, which §6.2 Typed API rules
  out.
- Rejected because: the PRD requires generated types checked in CI.

### No frontend test runner

- Rejected because: every story now carries frontend behaviour that needs
  unit tests, and Vitest reuses the existing Vite config.

## Consequences

- Good: one source for wire types; drift fails CI; providers are swappable.
- Bad: `reqwest` and `ts-rs` add compile time; the SSE parser is ours to
  maintain.
- Follow-up: the API key comes from `ANTHROPIC_API_KEY` until Settings
  stores provider keys (#107).
