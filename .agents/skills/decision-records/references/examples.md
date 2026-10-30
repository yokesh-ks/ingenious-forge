# ADR examples

One complete ADR and one that fails review, both Forge-flavoured. Read them
when unsure what "every section filled" means.

## Good

`docs/decisions/0003-split-the-backend-into-a-cargo-workspace.md`:

```markdown
# 0003. Split the backend into a Cargo workspace

- **Status:** Proposed
- **Date:** 2026-11-02
- **PRD:** §8 Architecture, §9 Phase 0

## Context

PRD §8 names the backend modules `server`, `agent`, `services`, `git`,
`db`, `api-types` and `utils`, and Phase 0 builds the workspace that holds
them. `api-types` must also generate TypeScript types for the web UI, and
the quality goals in §7 call for type-drift checks in CI. The Board release
later adds a `board` service and a worktree manager.

## Decision

Use one Cargo workspace with one crate per §8 module, plus a thin binary
crate that the `npx` launcher starts.

## Alternatives considered

### One crate with a module per area

- Pros: simplest build; no inter-crate version wiring.
- Cons: every change rebuilds everything; nothing stops `agent` from
  reaching into `db` internals.
- Rejected because: the §8 module boundaries would exist only by
  convention, and `api-types` could not be built alone for type
  generation.

### Separate repositories per service

- Pros: hard boundaries; independent releases.
- Cons: cross-repo changes for every API change; several CI pipelines.
- Rejected because: Forge ships as one npm package with one binary (§8
  Distribution), so independent releases buy nothing.

## Consequences

- Good: crate boundaries enforce the §8 modules; `api-types` builds alone
  for TypeScript generation.
- Bad: more `Cargo.toml` files to keep in step; slower first build.
- Follow-up: add the type-drift check in CI (§7); add the `board` crate in
  Phase 3.
```

Why it passes: PRD sections cited, two real alternatives each rejected for
a reason tied to the context, and consequences cover good, bad and
follow-up. Status is Proposed until the maintainer approves.

## Bad

`docs/adr/use-sqlite.md`:

```markdown
# Use SQLite

Status: Accepted

We decided to use SQLite because it's simple and fast. This is the best
choice for Forge.
```

Why it fails:

- Wrong place and no number: must be `docs/decisions/NNNN-….md`.
- Accepted by the author, with no date and no maintainer approval.
- No context or PRD trace: why does Forge need a store at all?
- No alternatives, so nobody can tell what was weighed.
- "Simple and fast" and "best choice" are claims, not reasons.
- No consequences: what gets harder, and what follow-up work exists?
- No index row in `docs/decisions/README.md`.
