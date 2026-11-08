# 0014. Search files with ignore, globset and regex; strip HTML in-house

- **Status:** Proposed
- **Date:** 2026-11-07
- **PRD:** §6.1 Built-in tools, §6.1 Sandbox, §8 Architecture

## Context

PRD §6.1 now lists `glob` (find files by pattern), `grep` (search file
contents with a regular expression) and `web_fetch` (fetch a page as text)
among the agent's built-in tools. The agent runs on the Rust server
(§8), so these tools run there.

`grep` should follow ripgrep's rules that users expect: skip files
`.gitignore` names, hidden files and binary files. `glob` matches paths
against patterns such as `src/**/*.ts`. `web_fetch` must turn an HTML page
into readable text for the model, and must respect the session's sandbox
network setting (§6.1 Sandbox), which is off by default.

## Decision

Use the `ignore` crate for the gitignore-aware directory walk, `globset`
for glob patterns and `regex` for content search. Convert HTML to text
with a small built-in stripper (drop `script` and `style`, turn block tags
into line breaks, decode common entities) over the existing `reqwest`
client, and refuse `web_fetch` while the session's network access is off.

## Alternatives considered

### Shell out to `rg` and `find`

- Pros: no new crates; ripgrep is the reference behaviour.
- Cons: `rg` is not installed everywhere (PRD §6.2 asks only for Node.js
  and git); output parsing differs by platform; Windows has no `find`.
- Rejected because: the tools must work on a fresh machine.

### Hand-written directory walk and glob matcher

- Pros: no new crates.
- Cons: gitignore semantics (negation, nested files, anchoring) and glob
  syntax (`**`, braces, classes) are large and easy to get subtly wrong.
- Rejected because: `ignore` and `globset` implement exactly these rules
  and are the libraries ripgrep itself is built from.

### `html2text` for page conversion

- Pros: better layout of tables and lists.
- Cons: pulls in a full HTML parser stack (`html5ever` and its
  dependencies) for one tool.
- Rejected because: a stripper of a few dozen lines gives the model
  readable text; Principle VIII prefers it until a real need appears.

## Consequences

- Good: search behaves like ripgrep on every platform; no new system
  prerequisites.
- Bad: three new crates (MIT or Unlicense, already common in the Rust
  ecosystem); HTML conversion is basic and loses table structure.
- Follow-up: plan step 6 implements the tools; revisit `html2text` if
  fetched pages prove hard for the model to read.
