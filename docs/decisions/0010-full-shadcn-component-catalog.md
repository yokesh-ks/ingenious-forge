# 0010. Pre-install the full Shadcn component catalog

- **Status:** Proposed
- **Date:** 2026-11-06
- **PRD:** §8 Architecture (Frontend: React and TypeScript SPA)

## Context

ADR [0002](0002-shadcn-tailwind-web-ui.md) adopted Shadcn UI and set the
rule "keep the component set minimal: add a primitive only when a view
actually needs it, per Principle VIII." Until now `src/components/ui/`
held only the eight primitives Forge's current views use (`badge`,
`button`, `input`, `textarea`, plus the four chat primitives later split
into `components/ai-elements/`, see ADR
[0009](0009-feature-based-web-ui-structure.md)).

The maintainer asked to add the full catalog from
[ui.shadcn.com/docs/components](https://ui.shadcn.com/docs/components)
(54 files, 50 of them new) ahead of any view needing them, reasoning that
an agent picking a primitive to build a view can then choose from the
full catalog in place rather than running the `shadcn` CLI first. This is
a deliberate exception to Principle VIII's "no code a current requirement
uses" guidance, made explicit here per that principle's own escape
clause ("unless its plan records the simpler option considered and why it
falls short").

Running `npx shadcn@latest add --all` surfaced two problems that this ADR
also resolves:

- `input-group` (`InputGroup`/`InputGroupAddon`/`InputGroupButton`/
  `InputGroupTextarea`) now resolves from the live registry — it 404'd
  when ADR 0002 was written, which is why that primitive was hand-copied
  into `components/ai-elements/` instead. The registry version exports
  the same names with near-identical styling, so the hand-copied
  `ai-elements/input-group.tsx` and its line in
  `ai-elements/LICENSE.chatbot-template` are redundant now that the CLI
  serves it; `message.tsx`, `message-scroller.tsx` and `bubble.tsx` still
  404 from the registry today, so they stay hand-copied in
  `ai-elements/` under that license.
- The bulk `add --all` overwrote four already-present, already-in-use
  files (`badge.tsx`, `button.tsx`, `input.tsx`, `textarea.tsx`) with an
  older registry template (forwardRef-based, Tailwind v3-era class names,
  no `icon-sm`/`xs` size variants) even though `shadcn diff <name>` on
  each file individually reports "No updates found" — a CLI
  inconsistency between the single-item and `--all` code paths, not an
  intentional upstream change. Reverted to the existing files, which
  `FilesPanel.tsx` and `ai-elements/message-scroller.tsx` depend on for
  the `icon-sm` button size.
- Two of the new files had broken imports as shipped:
  `components/ui/resizable.tsx` expects `react-resizable-panels`' pre-4.x
  API (`PanelGroup`, `PanelResizeHandle`); npm's caret range resolved the
  newly-released major 4, which dropped those exports for a different
  component model. Pinned to `react-resizable-panels@2.1.9`, the last 2.x
  release with the API the template expects.
  `components/ui/sidebar.tsx` imported its `useIsMobile` hook from
  `@/components/hooks/use-mobile`, a path that does not exist (the CLI
  wrote the hook to `src/hooks/use-mobile.tsx`, matching this project's
  layout); corrected the import to `@/hooks/use-mobile`.
- Ten of the new files trip this project's Biome ruleset (`a11y/*`,
  `correctness/noComponentHookFactories`, `security/noDangerouslySetInnerHtml`,
  `suspicious/noArrayIndexKey`, `suspicious/noDocumentCookie`) as shipped
  by the registry, which assumes ESLint's looser defaults. Hand-patching
  each generated file would break ADR 0002's "CLI-owned, not hand-edited"
  rule for `components/ui/`, so `apps/web/biome.json` gained a
  `src/components/ui/**` override turning off those specific rules for
  that folder only, the same treatment `src/api/types.ts` already gets
  for being generated.

## Decision

Run `npx shadcn@latest add --all` (`-y -o`) to install every component the
registry currently serves into `src/components/ui/`, ahead of any PRD
requirement needing most of them, and keep it current as new primitives
ship upstream. Consolidate `input-group` onto the now-working registry
version: delete `components/ai-elements/input-group.tsx` and switch its
one consumer, `Composer.tsx`, to `@/components/ui/input-group`.

## Alternatives considered

### Add a primitive only when a view needs it (status quo, ADR 0002)

- Pros: matches Principle VIII exactly; zero unused code or dependencies.
- Cons: every new view needing an unlisted primitive requires an extra
  CLI round-trip (and, per this ADR's findings, a round of exactly the
  breakage fixed here) before the view itself can be built.
- Rejected because: the maintainer wants the full catalog available for
  an agent to pick from immediately, without that round-trip, and
  accepts the unused-code trade-off explicitly.

### Add components to a disposable scratch area instead of `src/components/ui/`

- Pros: keeps `components/ui/` exactly matching "primitives Forge
  actually uses" for anyone reading the tree, while still giving an
  agent a local catalog to copy from.
- Cons: Shadcn's own convention — and ADR 0002's — is that
  `components/ui/` *is* the CLI-managed primitive folder; a second,
  parallel copy would need its own sync story and defeats the point of
  using the CLI's update/diff tooling (`shadcn diff`) going forward.
- Rejected because: it recreates the exact problem (a hand-maintained
  fork of CLI output) ADR 0002 avoided by using the CLI in the first
  place, for no real benefit over just installing into `ui/` directly.

## Consequences

- Good: every Shadcn primitive is available in `src/components/ui/`
  without a CLI round-trip; `shadcn diff`/`shadcn add <name> --overwrite`
  can update any of them later; the `input-group` duplication between
  `components/ui/` and `components/ai-elements/` is gone now that the
  registry serves it.
- Bad: 39 new runtime dependencies (`@radix-ui/react-*`, `react-hook-form`,
  `zod`, `recharts`, `embla-carousel-react`, `react-day-picker`,
  `date-fns`, `cmdk`, `vaul`, `sonner`, `next-themes`, `input-otp`,
  `react-resizable-panels`) ship to every Forge user even though almost
  none of them are reachable from any current view — a direct Principle
  VIII cost, accepted here rather than avoided; `apps/web/biome.json`
  needs a standing override for `components/ui/**`'s a11y/correctness/
  security rules, so a genuine new issue introduced inside that folder by
  a future hand-edit would be masked by the same override — mitigated by
  ADR 0002's existing "CLI-owned, not hand-edited" rule, which this ADR
  does not change; `react-resizable-panels` is pinned below its latest
  major, so `shadcn diff resizable` may re-offer the broken 4.x-targeting
  template on a future CLI update and needs the same fix reapplied.
- Follow-up: when a view needs a primitive this ADR added, verify with
  `shadcn diff <name>` that the CLI's current template still matches
  what shipped here before building against it, given the single-item
  vs. `--all` inconsistency found above; periodically retry
  `shadcn diff message message-scroller bubble` to see if the registry
  has stopped 404ing those, per ADR 0002's existing follow-up.
