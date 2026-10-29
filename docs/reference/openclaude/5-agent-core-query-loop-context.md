# Agent Core: Query Loop & Context

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/commands/set-context-window/set-context-window.test.ts](src/commands/set-context-window/set-context-window.test.ts)
- [src/query.ts](src/query.ts)
- [src/query/autoCompactCooldown.test.ts](src/query/autoCompactCooldown.test.ts)
- [src/query/providerMaxTokensCapRetry.test.ts](src/query/providerMaxTokensCapRetry.test.ts)
- [src/services/compact/autoCompact.test.ts](src/services/compact/autoCompact.test.ts)
- [src/services/compact/autoCompact.ts](src/services/compact/autoCompact.ts)
- [src/services/mcp/client.activity.test.ts](src/services/mcp/client.activity.test.ts)
- [src/services/mcp/client.test.ts](src/services/mcp/client.test.ts)
- [src/services/mcp/client.ts](src/services/mcp/client.ts)
- [src/tools/TaskOutputTool/TaskOutputTool.activity.test.ts](src/tools/TaskOutputTool/TaskOutputTool.activity.test.ts)
- [src/tools/TaskOutputTool/TaskOutputTool.tsx](src/tools/TaskOutputTool/TaskOutputTool.tsx)

</details>



The Agent Core layer is responsible for driving interactive and headless LLM agent turns, managing conversation transcripts, handling memory pressure via compaction, and administering system prompts. At the center of this subsystem is the asynchronous generator `query()` defined in [src/query.ts:1-168](), which orchestrates model calls, tool executions, token budgeting, and state transitions.

For details on specific subsystems, see the child pages:
- [Query Orchestration & Lifecycle](#5.1) — query() generator, QueryEngine, QueryGuard state machine/leases/timeouts, transitions, stop hooks, doom-loop guards.
- [Messages & Transcript Model](#5.2) — message factories, normalization, content/apiTransform, diffs, session history serialization, conversation cache.
- [Compaction & Context Management](#5.3) — autoCompact circuit breaker, compact/microCompact/snipCompact, contextCollapse, attachments and context efficiency.
- [Memory, Knowledge & Session Persistence](#5.4) — memdir, conversationArc, knowledgeGraph, session storage/restore/titles, extractMemories, stats.
- [Prompts & System Instructions](#5.5) — constants/prompts, prompt identity, built-in agent prompts, output styles.

---

## 5.1 Query Orchestration & Lifecycle

The query lifecycle manages conversation execution turns through an asynchronous generator function `query()` [src/query.ts:1-168]() working alongside state management primitives. It evaluates token budgets, handles context limits, catches provider errors (such as output token cap overflows), and coordinates the streaming execution of tools.

Safety and execution boundaries are enforced via `QueryGuard` state machines, execution leases, timeouts, and doom-loop guards that track consecutive tool failures or recursive execution anomalies [src/query.ts:133-136]().

For deep technical details, see [Query Orchestration & Lifecycle](#5.1).

Sources: [src/query.ts:1-168]()

---

## 5.2 Messages & Transcript Model

Conversations in OpenClaude are modeled as structured sequences of messages (`UserMessage`, `AssistantMessage`, `AttachmentMessage`, `TombstoneMessage`) [src/query.ts:35-44]() that undergo normalization before being sent to provider APIs [src/query.ts:68](). 

Message factories and normalization utilities handle content transformation, API payload mapping (`apiTransform`), diffing, and session history serialization. A conversation cache minimizes redundant tokenization across turns.

For deep technical details, see [Messages & Transcript Model](#5.2).

Sources: [src/query.ts:35-89]()

---

## 5.3 Compaction & Context Management

When sessions approach model token limits, the context management subsystem triggers auto-compaction and memory reduction strategies. The auto-compact circuit breaker tracks consecutive compaction failures and coordinates cooldown timeouts [src/services/compact/autoCompact.ts:88-136]().

Effective context window sizes are calculated by accounting for model-specific limits and summary output reservations [src/services/compact/autoCompact.ts:41-86](). Compaction operations include full summarization (`compact`), lightweight adjustments (`microCompact`), and history pruning (`snipCompact`).

For deep technical details, see [Compaction & Context Management](#5.3).

Sources: [src/services/compact/autoCompact.ts:1-150]()

---

## 5.4 Memory, Knowledge & Session Persistence

Session persistence and knowledge retrieval mechanisms store conversation transcripts, extracted memories, and conversation arcs under a dedicated memory directory (`memdir`). 

This subsystem provides storage, restoration, and title generation for sessions, alongside background tasks like `extractMemories` that build knowledge graphs and update statistics across runs.

For deep technical details, see [Memory, Knowledge & Session Persistence](#5.4).

Sources: [src/query.ts:1-168]()

---

## 5.5 Prompts & System Instructions

System prompts and base instructions define agent identity, behavior, and output styles. Constants and prompt templates govern how core models interpret constraints, formatting instructions, and available tool capabilities.

For deep technical details, see [Prompts & System Instructions](#5.5).

Sources: [src/query.ts:1-168]()

---

## Architecture & Flow Diagrams

### Diagram 1: Natural Language Turn Loop to Code Entity Space

```mermaid
graph TD
  User[""User Input / Prompt""] --> QueryGen[""async function query() [src/query.ts]""]
  QueryGen --> TokenCheck[""Token Budget & Limit Check [src/query.ts:148]""]
  TokenCheck -->|Exceeds Window| AutoCompact[""autoCompact() [src/services/compact/autoCompact.ts]""]
  TokenCheck -->|Normal| CallModel[""callModel() [src/query.ts:98]""]
  AutoCompact --> CallModel
  CallModel --> StreamResponse[""Streaming Assistant Response""]
  StreamResponse --> ToolExec[""StreamingToolExecutor [src/query.ts:123]""]
  ToolExec -->|Tool Use| ToolOrch[""runTools() [src/query.ts:125]""]
  ToolOrch --> QueryGen
```
Sources: [src/query.ts:1-168](), [src/services/compact/autoCompact.ts:1-150]()

### Diagram 2: Context Compaction Circuit Breaker & Memory Pressure

```mermaid
graph TD
  Pressure[""Memory Pressure / Token Threshold Exceeded""] --> CheckBreaker[""resolveAutoCompactCircuitBreakerState() [src/services/compact/autoCompact.ts:153]""]
  CheckBreaker -->|Failures < Max| RunCompact[""compactConversation() [src/services/compact/compact.ts]""]
  CheckBreaker -->|Failures >= Max| Cooldown[""Cooldown Circuit Breaker Active [src/services/compact/autoCompact.ts:135]""]
  RunCompact -->|Success| ResetFailures[""Reset Consecutive Failures Counter""]
  RunCompact -->|Failure| IncFailures[""Increment consecutiveFailures [src/services/compact/autoCompact.ts:96]""]
  IncFailures --> Cooldown
```
Sources: [src/services/compact/autoCompact.ts:88-150]()