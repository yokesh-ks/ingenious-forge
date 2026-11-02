# 0002. Adopt Tailwind CSS and Shadcn UI for the web frontend

- **Status:** Proposed
- **Date:** 2026-11-02
- **PRD:** §8 Architecture (Frontend: React and TypeScript SPA)

## Context

The web SPA (`web/`, becoming `apps/web/`) currently styles components with
hand-written CSS (`src/index.css`). PRD §8 names the frontend stack as
"React and TypeScript", not a specific component library, so adding one is
a Principle VIII complexity addition that needs its simpler alternative
recorded.

As the Composer and SessionView views grow (streaming output, tool-call
cards, diff review, approvals), hand-written CSS does not scale: every new
control needs its own styles written and kept visually consistent by hand.
The maintainer approved moving to Tailwind CSS plus Shadcn UI in this
conversation, alongside relocating `web/` to `apps/web/`.

## Decision

- Add Tailwind CSS v4 as the styling layer, via the `@tailwindcss/vite`
  plugin (no `postcss.config.js` needed) and `src/styles/globals.css`
  holding light/dark CSS-variable tokens consumed through `@theme inline`.
- Add Shadcn UI conventions: a `components.json`, a `src/components/ui/`
  folder for generated primitives (treated as CLI-owned, not hand-edited),
  and a `src/lib/utils.ts` `cn()` helper (`clsx` + `tailwind-merge`).
- Add Biome for the web package's lint and format, in place of
  ESLint/Prettier — one tool, one config file (`biome.json`), matching the
  Rust side's single-tool `cargo fmt`/`cargo clippy` discipline.
- Keep the component set minimal: add a primitive only when a view
  actually needs it, per Principle VIII.
- For chat-shaped UI (`SessionView`, `Composer`), use Shadcn's "AI
  Elements" pattern: `MessageScroller`/`Message`/`Bubble`/`InputGroup`,
  built on the headless `@shadcn/react` and `@base-ui/react` packages.
  As of this writing, `shadcn@latest add message-scroller message bubble`
  returns 404 against the live registry even though the components are
  documented at ui.shadcn.com/docs/ai-elements — so the source was copied
  by hand from shadcn's own reference implementation,
  [shadcn-ui/chatbot-template](https://github.com/shadcn-ui/chatbot-template)
  (MIT), trimmed of its Next.js/Vercel-AI-SDK wiring that Forge doesn't
  use. Retry the CLI once the registry items resolve, to pick up any
  upstream fixes without hand-diffing.

## Alternatives considered

### Keep hand-written CSS

- Pros: zero dependencies; what exists today.
- Cons: every new control (tool-call cards, diff viewer, approval dialogs)
  needs bespoke styling kept consistent by hand; no accessible primitives
  (dialogs, popovers) to build on.
- Rejected because: the PRD's P0/P1 feature list (review, approvals,
  streaming output) needs more UI surface than hand-written CSS can keep
  consistent without a design system.

### A different component library (MUI, Chakra, Ant Design)

- Pros: also solve the consistency problem; mature ecosystems.
- Cons: ship their own runtime styling engine and a fixed visual language
  that is harder to restyle; heavier dependency footprint than
  Tailwind-based, copy-in components.
- Rejected because: Shadcn generates source into the repo rather than
  adding an opaque runtime dependency, which fits Principle VIII's
  preference for inspectable, minimal additions.

## Consequences

- Good: a consistent, inspectable component set for the growing review/
  approval UI, including a real chat scroller/message/bubble composition
  ready for streamed session events; no new runtime dependency beyond
  Tailwind's build-time processing and the two small headless packages.
- Bad: Tailwind, `tw-animate-css`, `clsx`, `tailwind-merge`,
  `class-variance-authority`, `lucide-react`, `@shadcn/react` and
  `@base-ui/react` are now dependencies of `apps/web`; `biome.json` needs
  upkeep; the hand-copied chat primitives (`message-scroller.tsx`,
  `message.tsx`, `bubble.tsx`, `input-group.tsx`, `textarea.tsx`) must be
  re-diffed against upstream if shadcn changes them, since they are not
  CLI-managed yet.
- Follow-up: generate or hand-write only the Shadcn primitives each view
  needs; wire `SessionView`'s message list to real session data once the
  server exposes it over `/ws` (see ADR
  [0003](0003-server-cargo-workspace.md)); retry
  `shadcn add message-scroller message bubble` periodically and switch to
  CLI-managed versions once the registry serves them.
