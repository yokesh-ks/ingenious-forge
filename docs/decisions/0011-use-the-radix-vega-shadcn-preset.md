# 0011. Use the radix-vega Shadcn preset and its dependencies

- **Status:** Proposed
- **Date:** 2026-11-07
- **Supersedes:** the `cn()` helper detail in [0002](0002-shadcn-tailwind-web-ui.md) and the `react-resizable-panels` pin in [0010](0010-full-shadcn-component-catalog.md)
- **PRD:** §8 Architecture (Frontend: React and TypeScript SPA), §6.2 App navigation

## Context

ADR [0002](0002-shadcn-tailwind-web-ui.md) treats `src/components/ui/` as
CLI-owned and describes `cn()` as `clsx` plus `tailwind-merge`. ADR
[0010](0010-full-shadcn-component-catalog.md) pins
`react-resizable-panels` to 2.1.9, because the 4.x release broke the
`resizable` template of that time.

Applying the modern-minimal theme preset through the Shadcn CLI regenerated
the catalog against the `radix-vega` style (`apps/web/components.json`).
The regenerated primitives import from the `radix-ui` umbrella package and
from the `cn` package, and `ui/resizable.tsx` now targets the 4.x API. The
preset also moved `recharts` from 2 to 3 and added three
`@fontsource-variable/*` font packages.

The commit recorded no reason for these dependencies, which Principle VIII
requires. Review found that `clsx`, `tailwind-merge` and the separate
`@radix-ui/*` packages were left unused. It also found that the bundled
fonts were never applied: the theme names `Inter`, while the font files
declare `Inter Variable`, so the page uses the system font stack.

## Decision

Keep the CLI's `radix-vega` output as generated, with `radix-ui`, `cn`,
`react-resizable-panels` 4 and `recharts` 3. Remove `clsx`, `tailwind-merge`,
the separate `@radix-ui/*` packages and the three font packages.

## Alternatives considered

### Revert to the previous primitives and keep the old dependencies

- Pros: no new packages; ADRs 0002 and 0010 stay accurate.
- Cons: loses the preset, and leaves the primitives behind what the CLI
  generates, so `shadcn diff` reports every file.
- Rejected because: ADR 0002's rule is that the CLI owns these files, and
  reverting would put them in permanent disagreement with it.

### Keep the generated code but restore `clsx`, `tailwind-merge` and `@radix-ui/*` imports by hand

- Pros: no `cn` or `radix-ui` package.
- Cons: hand-edits 30 or more CLI-owned files, and the next CLI update
  undoes them.
- Rejected because: it breaks the "CLI-owned, not hand-edited" rule for no
  change in behaviour.

### Keep everything the preset added, including the fonts and old packages

- Pros: smallest diff; matches the CLI's install exactly.
- Cons: ships font files nothing renders and two declarations of Radix.
- Rejected because: Principle VIII says not to add what no requirement uses,
  and removing them does not change what the app renders.

### Fix the font names so the bundled fonts apply

- Pros: gets the type the preset intended.
- Cons: adds weight, and turns body text into a serif face in a compact
  tool UI. It is a visual change that nobody has asked for.
- Rejected because: the system stack is what the app shows today, and no
  PRD requirement calls for custom fonts.

## Consequences

- Good: one declared Radix dependency, no unused packages, and ADRs that
  describe the code once this is accepted.
- Bad: `cn` is a young package with a narrow purpose, and Forge now depends
  on it. `ui/form.tsx` carries a small hand-edit (its imports moved to
  `radix-ui`), so `shadcn diff form` may report it. The preset's font tokens
  in `styles/globals.css` still name fonts that are not bundled.
- Follow-up: on acceptance, update the Status lines of ADRs 0002 and 0010 as
  far as the supersede rules allow. Remove the unused font tokens from
  `styles/globals.css` the next time the theme changes.
