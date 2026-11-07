# 0013. Render Markdown with react-markdown, remark-gfm and Shiki

- **Status:** Proposed
- **Date:** 2026-11-07
- **PRD:** §6.2 Live session view, §6.2 Workspace panel, §8 Architecture

## Context

PRD §6.2 says the live session view shows "messages (rendered markdown and
code)". Forge renders assistant replies as plain text, so headings, lists,
bold and code fences reach the user as raw `###` and `**` (found in a
side-by-side run on 2026-11-07). The workspace panel's file tab (§6.2) also
needs a rendered Markdown view and a code view with syntax highlighting.

Model output is untrusted: links must not run script, raw HTML must not be
injected, and the renderer must handle GitHub-flavoured tables, task lists
and strikethrough. Principle VIII asks for the simpler option first.

## Decision

Render Markdown with `react-markdown` and `remark-gfm`, and highlight code
with `shiki`, loading each language grammar only when a block uses it.

## Alternatives considered

### Hand-written Markdown parser

- Pros: no dependency.
- Cons: CommonMark and GFM edge cases (nested lists, tables, escaping,
  autolinks) are large; a home-made parser is where XSS bugs hide.
- Rejected because: the effort and risk exceed one small, widely used
  dependency.

### `marked` with `dangerouslySetInnerHTML`

- Pros: small and fast.
- Cons: produces an HTML string, so safety depends on a separate sanitiser;
  React cannot reuse nodes while a reply streams.
- Rejected because: `react-markdown` builds React elements with no raw
  HTML by default, which removes the sanitiser and keeps streaming cheap.

### `highlight.js` or `prism` instead of Shiki

- Pros: smaller core.
- Cons: regex grammars, weaker accuracy; theme colours differ from editor
  themes.
- Rejected because: Shiki uses the same TextMate grammars as editors and
  loads languages lazily, so only used languages ship to the browser.

## Consequences

- Good: replies, read results and file previews share one renderer;
  untrusted HTML is never injected.
- Bad: three runtime dependencies (MIT) and Shiki's grammars and themes in
  the bundle as lazy chunks.
- Follow-up: the shared `Markdown` component (plan Step 1); reuse in the
  Read card (Step 10) and the file tab (Step 16).
