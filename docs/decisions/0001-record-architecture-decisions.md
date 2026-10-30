# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-30
- **PRD:** §8 Architecture, §11 Risks and open questions

## Context

Phase 0 (PRD §9) forces Forge's founding technical choices: the Rust
workspace layout, the web stack, the agent loop, the sandbox approach, the
model providers (PRD §11 Q2) and the name of the headless command (Q1).
Ideation (`adhd`) produces a shortlist and planning (`pdd`) produces a
design, but neither leaves a durable, numbered record of why one option
beat another. Without one, later contributors and agents re-argue settled
questions or quietly reverse them. Principle VIII also needs a place to
record the simpler option considered when a change adds complexity.

The maintainer set out this decision in issue
[#7](https://github.com/yokesh-ks/ingenious-forge/issues/7).

## Decision

Record each significant technical decision as an architecture decision
record (ADR) in `docs/decisions/`, managed with the `decision-records`
skill:

- Files are named `NNNN-kebab-title.md`, numbered from `0001` with four
  digits, sequential and gap-free.
- Each ADR has Status, Date, Context, Decision, Alternatives considered (at
  least two, each with a rejection reason) and Consequences.
- Lifecycle: Proposed → Accepted → Superseded or Deprecated. Only the
  maintainer moves an ADR to Accepted.
- An accepted ADR is never deleted or rewritten. A changed decision gets a
  new ADR with `Supersedes: NNNN`, and the old ADR's Status line alone
  changes to `Superseded by NNNN`.
- `docs/decisions/README.md` indexes every ADR and is updated in the same
  change.

## Alternatives considered

### Record decisions in the PRD only

- Pros: one document; no new folder.
- Cons: the PRD states what Forge does, not which options lost or why; its
  history lives only in Git diffs.
- Rejected because: the reasoning and rejected options are what stop a
  decision being re-argued, and the PRD has no place for them.

### Record decisions in GitHub issues and PR descriptions

- Pros: no files to maintain; discussion sits next to the decision.
- Cons: not in the repository, so agents working offline or from a clone
  cannot read them; no single index; no status lifecycle.
- Rejected because: agents read the repository, and a decision they cannot
  find is a decision they will reverse.

### Record nothing beyond commit messages

- Pros: zero overhead.
- Cons: the reasoning is scattered and unsearchable; alternatives are lost.
- Rejected because: it is the current state, and it is what causes
  re-argued decisions.

## Consequences

- Good: each founding decision has a findable, numbered record with its
  alternatives; Principle VIII justifications have a home.
- Bad: each significant decision costs a short document and a maintainer
  review.
- Follow-up: record the Phase 0 decisions as they are made, and link the
  ADRs that settle PRD §11 Q1–Q3 from the PRD table.
