# Detection passes and severity

Read this in analyze step 4. Each pass lists its detection rules, the
default severity of each rule and an example. A rule's severity can rise
(never fall) when the item is security-related or blocks baseline
function. Every finding quotes the text it is about and gives its location.

Finding IDs are the pass letter plus a number (`A1`, `E2`), numbered in
document order: story, `idea-honing.md`, `detailed-design.md`, `plan.md`,
then task files by path. A rerun with no document changes gives the same
IDs.

## Severity scale

| Severity | Use for |
| --- | --- |
| CRITICAL | Violates a MUST or MUST NOT in `AGENTS.md` § Principles; a core document is missing; a requirement has no task and blocks baseline function. |
| HIGH | Conflicting or duplicate requirements; an ambiguous security or performance attribute; an untestable acceptance criterion; a contradiction of an Accepted ADR; a functional requirement with no task that does not block baseline function. |
| MEDIUM | Terminology drift; a non-functional requirement with no task; an underspecified edge case; a task naming a component the design does not define. |
| LOW | Wording, minor redundancy, a conflict with a Proposed (not yet Accepted) ADR. |

A requirement "blocks baseline function" when the feature cannot do its
main job without it, or a document says so ("the only way", "useless
without").

## A. Duplication

- Two requirements that say the same thing in different words, within one
  document or across documents with different keys. **HIGH.** Recommend
  keeping the clearer phrasing under one key.
- Two tasks that build the same thing. **MEDIUM.**
- Repeated text that adds nothing. **LOW.**

Example: `REQ-2: filter by title` and story `AC4: search sessions by
title` with no cross-reference → A1, HIGH.

## B. Ambiguity

- A vague quality word with no measurable target: fast, quick, scalable,
  secure, robust, intuitive, simple, efficient, responsive, reliable,
  large, many. **HIGH** when it describes performance or security,
  **MEDIUM** otherwise.
- A placeholder left in: `TODO`, `TBD`, `TKTK`, `???`, `<…>`, `XXX`.
  **HIGH** in a requirement or acceptance criterion, **MEDIUM** elsewhere.
- An acceptance criterion with no observable result ("works correctly",
  "handles errors gracefully"). **HIGH** (untestable).

Example: `Search must be fast.` (`idea-honing.md`, REQ-2) → B1, HIGH:
"Performance attribute with no number. Recommend a target such as results
within 100 ms for 1,000 sessions."

## C. Underspecification

- A task that names a component, file, endpoint or data field that neither
  the design nor the plan defines. **MEDIUM** (HIGH if it handles auth,
  secrets or user data).
- A requirement with a verb but no object or outcome ("support export").
  **MEDIUM.**
- A story acceptance criterion that no task's acceptance criteria restate
  or test. **MEDIUM.**
- An edge case the requirements raise (empty, error, concurrent,
  not-found) with no handling in design or tasks. **MEDIUM.**

Example: task `step02/task-01` caches results in `SessionIndexCache`; the
design's Components list only `SessionList` and `SessionStore` → C1,
MEDIUM.

## D. Principle alignment

Read `AGENTS.md` § Principles each run; do not work from memory, since
principles are amended. For each MUST or MUST NOT, check the documents for
a statement that breaks it. Every finding is **CRITICAL** and names the
principle number and the rule. Common checks:

| Principle | Look for |
| --- | --- |
| I | A feature with no `docs/PRD.md` section; scope added beyond the referenced PRD section; a desktop app, terminal UI or editor extension as a delivery surface. |
| II | A plan that starts application code before the spec and plan are approved. |
| IV | A step where an agent approves or merges its own work. |
| V | Copied third-party code or text with no licence file or `NOTICE` entry. |
| VI | A project skill outside `.agents/skills/`, or rules placed in tool-specific wiring. |
| VII | AI attribution (`Co-Authored-By` an AI, "Generated with", an AI as author); a competing product named in product docs; a verification gate or evidence report described in product docs. |
| VIII | A new language, service, datastore or runtime dependency not in PRD §8 with no simpler option recorded. |

SHOULD rules (such as VIII's second bullet) give MEDIUM findings, not
CRITICAL.

Example: `Commit each step with a Co-Authored-By: Claude … trailer`
(`plan.md`, Conventions) → D1, CRITICAL, Principle VII.

## E. Coverage gaps

Build the coverage table first; these rules read from it.

- A requirement with no task. **CRITICAL** if it blocks baseline function,
  **HIGH** if functional, **MEDIUM** if non-functional.
- A task that maps to no requirement or acceptance criterion: list it
  under *Unmapped tasks*. **MEDIUM**, or **HIGH** if it adds scope.
- A plan step with no task files, or task files with no plan step.
  **MEDIUM.**

Coverage % = requirements with at least one task ÷ total requirements,
rounded down to a whole number.

Example: REQ-3 (resume from the list) has no task, and `idea-honing.md`
says the list "is useless" without it → E1, CRITICAL.

## F. Inconsistency

- Terminology drift: one concept under two names across documents
  (session / conversation, card / ticket). **MEDIUM.** Recommend the term
  the PRD glossary or the design uses.
- A data entity or field in the plan or tasks but not the design, or the
  reverse. **MEDIUM.**
- Two documents that conflict on behaviour, stack or order (sort newest
  first vs oldest first; React vs Vue). **HIGH.**
- Task order that contradicts dependencies (a task using an endpoint a
  later step creates, with no note). **MEDIUM.**

Example: the design and story say "session"; `plan.md` Step 1 and
`step01/task-01` say "conversation" for the same thing → F1, MEDIUM.

## G. ADR conflicts

Read `docs/decisions/*.md`. If there are none, record "Pass G skipped: no
ADRs" in the report and move on.

- A design, plan or task element that contradicts the decision of an
  **Accepted** ADR (a different library, data model, protocol or process
  than the ADR chose). **HIGH.**
- The same against a **Proposed** ADR. **LOW**, noted for awareness.
- Superseded, Deprecated or Rejected ADRs are ignored, except to note a
  plan that relies on one. **MEDIUM.**
- A choice expensive to reverse made in the design with no ADR. **LOW**,
  recommending `decision-records`.

Example: an Accepted ADR chooses SQLite for session metadata; the design
reads metadata from JSON files on disk → G1, HIGH.

## Overflow

Keep the 50 most severe findings in the table (CRITICAL first, then by
ID). Summarise the rest as one line per category with counts, for example
"Overflow: 12 more (B: 7 MEDIUM, F: 5 LOW)".
