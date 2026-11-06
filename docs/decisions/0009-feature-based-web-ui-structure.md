# 0009. Organize `apps/web/src` by feature instead of by file type

- **Status:** Proposed
- **Date:** 2026-11-06
- **PRD:** §8 Architecture (Frontend: React and TypeScript SPA)

## Context

`apps/web/src` was organized by file type: `components/`, `hooks/`,
`lib/`, `session/` and `pages/`. Files from unrelated domains — session
chat, git status and diffs, sandbox/approval controls, the terminal —
lived side by side in the same top-level folders (for example
`components/` held `SessionView.tsx`, `GitBadge.tsx`, `SandboxBadge.tsx`
and `TerminalPanel.tsx` with no grouping). Finding all the code for one
domain meant searching across `components/` and `session/` by name.

PRD §8 names the frontend stack as "React and TypeScript" without
prescribing an internal source layout, so this is an internal
reorganization, not a scope change (Principle I): `docs/PRD.md` needs no
update. It introduces no new dependency, service or runtime (Principle
VIII), only a different arrangement of existing files, so no simplicity
trade-off write-up is needed beyond the alternatives below. This is
tracked as issue #123, filed because Forge Board and further Forge Agent
UI work (session review, approvals, more git and sandbox surface) will
keep adding files to these same folders, making the problem worse the
longer it waits.

## Decision

Group `apps/web/src` by domain under `src/features/<domain>/`, each
holding that domain's `components/`, `hooks/` and (when needed) `api/`:

- `features/session/` — `SessionView`, `SessionWorkspace`,
  `SessionHeader`, `SessionSidebar`, `Composer`, `ToolCallCard` and the
  `use-session`, `use-project-sessions` hooks, plus `session-reducer`
  (the feature's shared reducer/state, kept at the feature root since it
  is neither a component nor a hook).
- `features/git/` — `GitActions`, `GitBadge`, `ChangedFilesPanel`,
  `DiffView`, `FileTree`, `FilesPanel` and the `use-git-status` hook.
- `features/sandbox/` — `SandboxBadge`, `ApprovalModePicker`,
  `ModelFields`, `FolderPicker`, `NewSessionForm` and the `use-sandbox`,
  `use-model-catalog` hooks.
- `features/terminal/` — `TerminalPanel` and the `use-terminal` hook.

Keep only genuinely cross-cutting code in the top-level shared layers,
unchanged in spirit: `components/ui/` (Shadcn primitives) plus
`components/theme-toggle.tsx` (used only by the app shell, not any
feature), `hooks/use-theme.ts`, `lib/` (`utils`, `time`, `router`,
`approval-modes`, `slash-commands`, `file-tree`, `models` — `models.ts`
stays shared despite not being named in the issue's illustrative list,
because `SessionHeader` (session), `ModelFields`/`NewSessionForm`/
`use-model-catalog` (sandbox) and `ProjectPage` (a page) all depend on
it), `api/` (typed client, generated types), `pages/` (route-level
composition) and `test/` (test helpers).

Within each feature (and each shared layer), tests live in a sibling
`__tests__/` folder that mirrors the folder it covers, rather than next
to the source file: `features/git/__tests__/components/GitBadge.test.tsx`
tests `features/git/components/GitBadge.tsx`,
`features/git/__tests__/hooks/use-git-status.test.ts` tests
`features/git/hooks/use-git-status.ts`, and likewise
`pages/__tests__/HomePage.test.tsx`, `lib/__tests__/models.test.ts` and
`api/__tests__/client.test.ts`. A feature-level integration test with no
single matching source file (`long-session.test.tsx`) sits directly under
the feature's `__tests__/`.

Files moved with `git mv` to preserve history; every import updated to
the new paths (cross-feature imports go through the `@/features/<domain>/
...` alias; a test's import of its own covered module stays relative,
adjusted for the extra `__tests__/` directory level).

## Alternatives considered

### Keep the file-type-based layout

- Pros: zero migration cost; nothing to relearn.
- Cons: the problem this ADR exists to fix only gets worse as Forge Board
  and more Forge Agent UI add files to the same flat `components/`,
  `session/` and `lib/` folders; cross-domain code already shares folders
  with no grouping.
- Rejected because: issue #123 shows the navigation cost is already real
  (`components/` mixes four unrelated domains), and the app is only
  growing.

### Feature-Sliced Design (FSD)

- Pros: a stricter, more prescriptive convention (enforced layers —
  `app`/`pages`/`widgets`/`features`/`entities`/`shared` — and
  cross-import rules) that scales well on much larger frontends.
- Cons: adds enforced-layer ceremony (public-API `index.ts` boundaries
  per slice, strict layer-import direction, extra terminology) that this
  app's current size — four feature domains, under 100 source files —
  does not need yet.
- Rejected because: the goal is grouping by domain, not scaling to a
  frontend with many teams or dozens of slices; plain feature-based
  folders solve the actual problem (navigation) without the extra
  structure FSD would require maintaining.

## Consequences

- Good: all of one domain's components, hooks and tests live under one
  folder (for example everything git-status-related is under
  `features/git/`), matching how the app is actually extended feature by
  feature; the shared layers (`components/ui/`, `hooks/`, `lib/`, `api/`,
  `pages/`, `test/`) stay small and genuinely cross-cutting, making it
  obvious when something new belongs in a feature instead.
- Bad: cross-feature imports (for example `SessionHeader` importing
  `GitBadge` and `SandboxBadge`, or `SessionWorkspace` importing
  `ChangedFilesPanel`, `FilesPanel` and `TerminalPanel`) are now longer
  `@/features/<domain>/components/<Name>` paths instead of same-folder
  relative imports, making those cross-domain dependencies more visible
  but more verbose; a future domain boundary violation (a feature
  reaching into another feature's internals rather than its intended
  surface) is not yet enforced by tooling, only by convention.
- Follow-up: `AGENTS.md`'s "Repository layout" bullet for `apps/web/`
  documents the new convention; `docs/decisions/0002-shadcn-tailwind-web-ui.md`
  and `docs/decisions/0004-model-client-and-typed-api.md` were checked
  for moved paths (0002 names no internal `src/` paths that moved; 0004's
  `apps/web/src/api/types.ts` reference stays correct, since `api/` is
  unchanged). If a feature boundary is crossed often enough to need
  enforcement, consider a lint rule (such as an import-boundaries plugin)
  rather than adopting FSD wholesale.
