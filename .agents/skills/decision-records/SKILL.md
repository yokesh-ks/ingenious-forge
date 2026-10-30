---
name: decision-records
description: Use when a significant technical choice is made, proposed or reversed and should be recorded, such as a framework, library or major dependency, a data model or schema, authentication, API architecture, build, hosting or infrastructure, or anything expensive to reverse. Triggers include "record that", "write an ADR", "we've decided to use X", "we're switching to Y", "log this decision", "supersede ADR NNNN", "why did we pick X", and settling a PRD open question. Also use when a plan needs to justify extra complexity under Principle VIII.
license: MIT
---

# Decision records

Write, supersede and index Architecture Decision Records (ADRs) in
`docs/decisions/`, so every significant technical choice keeps its context,
the alternatives that lost and its consequences. An ADR records *why* option
A beat option B, so later agents neither re-argue it nor quietly reverse it.

An ADR is history. Once accepted, its body never changes; a new decision
gets a new ADR.

## When not to use it

- The choice is cheap to reverse or local to a few lines of code: a helper
  name, a variable, a file split, a test layout. Say so and stop (step 1).
- General documentation: code comments, API docs, READMEs.
- Scope changes: those go in `docs/PRD.md` first (Principle I). An ADR may
  follow to record how the scope is met.
- Back-filling decisions already implicit in the PRD. Record them only when
  one comes up for a real choice.
- Open-ended exploration: run `adhd` or the `pdd` workflow of `agent-sop`
  first, then record the outcome here.

## Workflow

### 1. Gate

The decision qualifies only if it matches at least one trigger:

- choosing a framework, library or major dependency;
- a data model or schema;
- authentication or authorisation;
- API architecture (protocol, versioning, transport);
- build, hosting, distribution or infrastructure;
- anything else expensive to reverse (many files, a migration, a public
  contract, a user-visible behaviour).

If none matches, write no file. Tell the user which test it failed and why,
for example: "Naming a helper is a local code choice that a rename reverses
in minutes, so it does not get an ADR. Put the name in the plan or code."
This holds even when the user says "record an ADR". No ADR spam.

### 2. Gather context

Read, before drafting:

- the `docs/PRD.md` sections the decision touches (often §8 Architecture
  and §11 open questions);
- the Principles in `AGENTS.md`;
- every ADR in `docs/decisions/`: to continue its format, avoid
  contradicting an accepted one, and find what this one may supersede;
- any `adhd` shortlist or `pdd` research in
  `output/planning/<project>/research/`.

If the user gave no reason for the decision, ask for it. Do not invent one.

### 3. Number it

- Match the existing convention in `docs/decisions/`. Never start a second
  numbering scheme or location (`docs/adr/`, `ADR-1`, …).
- Next number = highest existing number + 1, four digits, starting `0001`.
  No gaps, no reuse.
- Filename: `docs/decisions/NNNN-kebab-title.md`, the title in imperative
  form (`0002-use-sqlite-for-the-local-store.md`).
- If `docs/decisions/` does not exist, bootstrap it first (see
  [Bootstrap](#bootstrap)).

### 4. Draft it with Status: Proposed

Copy [references/adr-template.md](references/adr-template.md) and fill every
section:

- **Context:** the forces and constraints, with PRD sections cited.
- **Decision:** one or two sentences, active voice.
- **Alternatives considered:** at least two real alternatives, each with
  pros, cons and a concrete rejection reason. "Do nothing" or "keep the
  current choice" counts when it is real. "The maintainer chose otherwise"
  is not a rejection reason; ask for the real one.
- **Consequences:** the good, the bad and the follow-up work.

Read [references/examples.md](references/examples.md) when unsure what
"complete" looks like.

### 5. Check it against the principles

Go through each principle in `AGENTS.md` and answer "does this decision
violate it?" Pay most attention to:

- **I (PRD is the source of truth):** if the decision contradicts or
  reshapes `docs/PRD.md` (for example a datastore other than the one §8
  names), the PRD must change first, in this change or an earlier one,
  and the maintainer must approve that PRD change.
- **VIII (Simplicity first):** a language, service, datastore or runtime
  dependency beyond PRD §8 needs the simpler option among the alternatives
  and why it falls short.
- **VII (Forge speaks for itself):** in the ADR, refer to competing coding
  agents as "third-party CLI agents".

If the decision conflicts with a principle, stop and tell the user. Offer
two ways forward: change the decision, or propose a principle amendment in
its own `docs(principles): …` commit per the governance rules. Do not edit
the PRD or the principles on your own to make the conflict disappear.

### 6. Human gate

Present the draft to the maintainer and wait. Never set Accepted yourself,
even when the user stated the decision: stating a decision is not approving
this record of it. On explicit approval, set `Status: Accepted` and set
`Date` to the approval date (ISO 8601).

A draft may be committed as Proposed for review in a PR. A proposal the
maintainer declines is removed before it merges, so numbering stays
gap-free.

### 7. Supersede

When a decision changes:

1. Write a new ADR (steps 1–6) with `Supersedes: NNNN` linking the old one.
   Its Context says what changed since the old ADR.
2. Leave the old ADR untouched while the new one is Proposed.
3. Once the new ADR is accepted, change *only* the old ADR's Status line to
   `Superseded by [MMMM](MMMM-title.md)`. Every other byte stays the same.

Retiring a decision with no replacement: set the Status line to
`Deprecated`, again after the maintainer approves, and change nothing else.

Never delete an ADR or rewrite an accepted ADR's body, not even to fix a
fact. Write a new ADR instead.

### 8. Index

Keep `docs/decisions/README.md` as a table with one row per ADR: number
(linked), title, status, date. Add or update rows in the same change as the
ADR. The index status must match the ADR's Status line.

### 9. Link it

- If the decision answers a PRD open question (§11 Q1–Q3) or affects an
  epic, add a link to the ADR in that issue or PRD row.
- When an accepted ADR resolves a PRD question, update the PRD table row to
  reference the ADR. Do this only after acceptance.

### 10. Commit

`docs(decisions): add NNNN <title>`, for example
`docs(decisions): add 0002 use SQLite for the local store`. Superseding
uses the new ADR's number; the old ADR's Status line goes in the same
commit once accepted. No AI attribution (Principle VII).

## Bootstrap

The first run in a repository without `docs/decisions/` creates:

- `docs/decisions/README.md`: a short intro and the index table;
- `docs/decisions/0001-record-architecture-decisions.md`: the
  meta-decision to use ADRs in this format and location.

Then the decision at hand becomes `0002`.

## Outputs

- `docs/decisions/NNNN-kebab-title.md`: the ADR.
- `docs/decisions/README.md`: index row added or updated.
- For a supersede: the old ADR's Status line only.
- After acceptance, where relevant: a link in `docs/PRD.md` §11 or the
  epic's issue.

## Common rationalisations

| Excuse | Reality |
| --- | --- |
| "The user asked for an ADR, so I'll write one." | The gate still applies. Explain why a trivial choice does not qualify. |
| "The user stated the decision, so it's Accepted." | Stating is not approving the record. Proposed until the maintainer approves. |
| "The PRD is the source of truth, so I'll just edit it." | The PRD records scope; the ADR records why and what lost. A contradicting decision needs the PRD changed with the maintainer, not silently. |
| "There was only one real option." | Then write down why the others fail. Fewer than two alternatives is not an ADR. |
| "I'll just fix the typo in the accepted ADR." | Accepted ADRs are frozen except for the Status line. |
| "The old ADR is clearly superseded now." | Not until the new one is accepted. |
| "I'll update the index later." | Same change, or the index lies. |

## Red flags

Stop and go back a step if you notice any of these:

- writing an ADR for a name, a local refactor or anything a revert undoes;
- a folder other than `docs/decisions/` or a number that skips or repeats;
- Status Accepted on an ADR the maintainer has not approved;
- fewer than two alternatives, or a rejection reason that is only "we
  decided";
- a diff on an accepted ADR that touches anything but the Status line;
- editing `docs/PRD.md` or `AGENTS.md` to remove a conflict the ADR caused;
- an invented reason because the user gave none.

## Provenance

Adapted from the `documentation-and-adrs` skill in
https://github.com/addyosmani/agent-skills, path
`skills/documentation-and-adrs/`, commit
`eb07f19f52c2669f2364897aaa293e2aaddd7b1c`, MIT License, Copyright (c) 2025
Addy Osmani. See `LICENSE`. Forge kept the ADR triggers, "match the
existing convention first", the template sections and the lifecycle; it
dropped the inline-comment, API-docs, README, changelog and prose-review
guidance, and added the gate, the principle check, the human approval gate,
four-digit numbering and the index.
