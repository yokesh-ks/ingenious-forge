# Ingenious Forge — AGENTS.md

**Ingenious code, proven.**

A verification-first, web-native coding harness. Part of the
[InGeniousClan](https://www.ingeniousclan.com/) ecosystem.

This file is for AI coding agents working in this repository.

---

## Project Mission

**Verification-first:** Every change must be proven by execution, not by
the agent's opinion of its own work.

Before considering a change complete, prefer:
1. Running existing tests
2. Executing the change in a sandboxed environment
3. Recording execution evidence (logs, exit codes, outputs)
4. Validating against a relevant benchmark if applicable

---

## Repository Layout

The repository root contains the source for the Ingenious Forge harness.
Configuration and lockfiles live at the root; source code is organized
by module underneath.

---

## Build & Run

No root package manager or entry point is configured yet. Confirm the
runtime and dependency tooling before making changes.

---

## Testing & Verification

* **Unit tests:** test individual functions and modules in isolation.
* **Integration tests:** validate components working together.
* **Exit-condition testing:** cost limits, context limits, model errors,
  invalid command formats, and blocklisted commands.
* **Benchmarking:** use [SWE-bench](https://www.swebench.com/) or
  [mini-SWE-agent](https://mini-swe-agent.com/latest/) as baselines for
  coding-agent performance.
* **Trajectory validation:** ensure action histories are recorded
  correctly and reproducibly.

---

## Coding Conventions

* **Commits:** conventional commit prefixes (e.g., `docs:`, `feat:`,
  `fix:`, `refactor:`).
* **Branches:** `main` is the default branch; use short-lived feature
  branches.
* **Formatting:** keep code and markdown clean and consistent.

---

## AI Agent Operating Guidelines

1. **Read before writing:** inspect existing files before editing or
   overwriting them.
2. **Verification-first:** never claim a change works without executing
   it or pointing to existing test evidence.
3. **Sandboxing:** run agent-generated or agent-modified code in an
   isolated sandbox. Do not modify the host filesystem outside the
   workspace unless explicitly required.
4. **External standards:** when connecting agents to tools/data, consider
   [MCP](https://modelcontextprotocol.io/); when enabling agent-to-agent
   collaboration, consider
   [A2A](https://github.com/a2aproject/A2A).

---

## How to Update This File

If you change the repository structure, verification process, or
development workflow, update `AGENTS.md` in the same pull request. Keep
it concise.
