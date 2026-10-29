# CLI & Entrypoints

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/cli/bg.test.ts](src/cli/bg.test.ts)
- [src/cli/bg.ts](src/cli/bg.ts)
- [src/cli/bgFinalizer.fixture.ts](src/cli/bgFinalizer.fixture.ts)
- [src/cli/bgFinalizer.test.ts](src/cli/bgFinalizer.test.ts)
- [src/cli/bgFinalizer.ts](src/cli/bgFinalizer.ts)
- [src/cli/bgRegistry.cleanup.test.ts](src/cli/bgRegistry.cleanup.test.ts)
- [src/cli/bgRegistry.test.ts](src/cli/bgRegistry.test.ts)
- [src/cli/bgRegistry.ts](src/cli/bgRegistry.ts)
- [src/cli/bgRouting.ts](src/cli/bgRouting.ts)
- [src/cli/print.ts](src/cli/print.ts)
- [src/entrypoints/cli.test.ts](src/entrypoints/cli.test.ts)
- [src/entrypoints/cli.tsx](src/entrypoints/cli.tsx)
- [src/main.tsx](src/main.tsx)
- [src/skills/bundled/updateConfig.ts](src/skills/bundled/updateConfig.ts)

</details>



## Purpose & Scope

This page provides a high-level overview of how OpenClaude boots, parses arguments, routes flags, and exposes interactive, background, headless, and SDK execution modes. OpenClaude uses a multi-tiered entrypoint system split between bootstrap initialization scripts [src/main.tsx:1-35]() and CLI argument routing layers [src/entrypoints/cli.tsx:1-12](). 

For full technical implementations and low-level details, refer to the child pages:
- Startup & Bootstrap Flow: [Startup & Bootstrap Flow](#2.1)
- Background Sessions (`--bg`): [Background Sessions (--bg)](#2.2)
- Headless Print Mode & SDK: [Headless Print Mode & SDK](#2.3)
- Slash Commands & CLI Handlers: [Slash Commands & CLI Handlers](#2.4)

---

## Architecture Overview: CLI Boot & Entrypoint Routing

The following diagram maps high-level user invocation concepts (Natural Language Space) to their corresponding execution modules and entrypoints (Code Entity Space).

### CLI Boot Sequence Architecture
```mermaid
graph TD
    User[""User Invocation Terminal""] -->|Runs bin/openclaude| CLIEntry[""CLI Entrypoint (src/entrypoints/cli.tsx)""]
    CLIEntry -->|Applies Heap & Pre-reads| Main[""Main Initialization (src/main.tsx)""]
    
    Main -->|Interactive REPL Mode| Repl[""REPL Launcher (src/replLauncher.ts)""]
    Main -->|Background Flag --bg| BgHandler[""Background Routing & Registry (src/cli/bg.ts)""]
    Main -->|Headless Print Mode --print| PrintHandler[""Headless Print & Structured IO (src/cli/print.ts)""]
    Main -->|Slash Commands| CmdHandler[""Commands Registry (src/commands.ts)""]

    subgraph "Code Entity Space"
        CLIEntry
        Main
        Repl
        BgHandler
        PrintHandler
        CmdHandler
    end
```
Sources: [src/main.tsx:1-37](), [src/entrypoints/cli.tsx:1-10](), [src/cli/bg.ts:42-50](), [src/cli/print.ts:10-16]()

---

## 2.1 Startup & Bootstrap Flow

The OpenClaude initialization sequence begins inside `src/entrypoints/cli.tsx` and transitions into `src/main.tsx`. Critical environment checks, MDM raw reads, and keychain prefetching occur concurrently before heavy module evaluation to minimize startup latency [src/main.tsx:1-20](). Setup gates validate configuration policies, token limits, and provider states before mounting the terminal UI or executing headless commands.

Graceful shutdown handlers ensure that terminal modes (such as mouse tracking, bracketed paste, and alternate screen buffers) are properly torn down via `cleanupTerminalModes()` [src/utils/gracefulShutdown.ts:66-148]().

For details on the startup sequence, provider validation, and graceful shutdown mechanics, see [Startup & Bootstrap Flow](#2.1).

Sources: [src/main.tsx:1-40](), [src/entrypoints/cli.tsx:1-15](), [src/utils/gracefulShutdown.ts:66-148]()

---

## 2.2 Background Sessions (`--bg`)

OpenClaude supports executing long-running tasks in the background using the `--bg` flag. The background subsystem manages session state persistence, process markers [src/cli/bgRouting.ts:12-22](), log streaming [src/cli/bg.ts:87-125](), and process supervision [src/cli/bg.ts:1-40](). 

Background processes are tracked inside a local registry directory (`bg-sessions`), complete with stdout/stderr capture paths, liveness verification, and cleanup worker routines [src/cli/bgRegistry.ts:193-224]().

### Background Session Subsystem Architecture
```mermaid
graph TD
    UserCommand[""User CLI Command (--bg)""] -->|Spawns Child Process| BgModule[""Background Launch & Config (src/cli/bg.ts)""]
    BgModule -->|Registers Metadata| BgRegistry[""Background Session Registry (src/cli/bgRegistry.ts)""]
    BgRegistry -->|Writes Logs & State| Disk[""Config Directory (~/.config/openclaude/bg-sessions)""]
    BgModule -->|Attaches Finalizer| Finalizer[""Background Finalizer (src/cli/bgFinalizer.ts)""]

    subgraph "Code Entity Space"
        BgModule
        BgRegistry
        Finalizer
    end
```
Sources: [src/cli/bg.ts:54-71](), [src/cli/bgRegistry.ts:193-224](), [src/cli/bgRouting.ts:3-10]()

For details on background session registries, process markers, finalizers, and management handlers (`ps`, `logs`, `attach`, `kill`), see [Background Sessions (--bg)](#2.2).

Sources: [src/cli/bg.ts:1-75](), [src/cli/bgRegistry.ts:42-120](), [src/cli/bgRouting.ts:1-41]()

---

## 2.3 Headless Print Mode & SDK

When invoked with `--print` or via programmatic SDK entrypoints, OpenClaude bypasses the interactive Ink REPL interface and routes execution through `src/cli/print.ts`. This mode leverages structured IO handlers [src/cli/print.ts:10](), heartbeats, and stream guards to deliver clean, machine-readable output suitable for automated pipelines and agent SDK integrations.

For details on print mode execution, structured IO protocols, generated SDK types, and test suites, see [Headless Print Mode & SDK](#2.3).

Sources: [src/cli/print.ts:1-25](), [src/utils/printFlag.js:1-35]()

---

## 2.4 Slash Commands & CLI Handlers

OpenClaude exposes hundreds of slash commands and utility handlers organized within the `src/commands` registry and `src/cli/handlers/` directories. These handlers cover specialized capabilities such as MCP server integrations, AIMLAPI operations, bundled skills, and self-update routines [src/main.tsx:50-51]().

For details on the command registry architecture, slash command parsing, and specialized CLI handlers, see [Slash Commands & CLI Handlers](#2.4).

Sources: [src/main.tsx:50-51](), [src/commands.js:1-20]()