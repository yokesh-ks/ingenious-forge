---
name: verify-before-done
description: Use when about to say work is done, fixed, passing, working, complete or ready; before committing, pushing, opening a PR, closing an issue, or ticking a task or acceptance-criteria box; when writing a PR "Status" section, an issue closing comment or a "no regressions" line; when a subagent or helper reports success; or when someone says "it passed earlier", "skip that check", "it was already failing", "docs don't need checks" or "just say it's verified".
license: MIT
---

# Verify before done

No claim that work is done, fixed or passing without fresh command output
that proves it. When it cannot be proved, say exactly what is and is not
known.

This is a rule for agents building Forge. It is a development-process rule,
not a Forge product feature, and it does not belong in `docs/PRD.md` or
other product docs.

**Core rule:** if you have not run the proving command after your last
edit, in this turn, you cannot claim it passes.

## The gate

```text
1. IDENTIFY  the command that proves the claim (step 2)
2. RUN       the full command, fresh, after the last edit (step 3)
3. READ      the full output: exit code, failure and warning counts (step 4)
4. VERIFY    the output confirms the claim, against the baseline (step 5)
5. CLAIM     only then, with the evidence; otherwise state the real status
```

Skipping a step is not a shortcut; it turns the claim into a guess.

## When not to use it

- Answering a question that makes no claim about the state of work.
- Interim progress notes that clearly say the work is unfinished
  ("still running", "not yet checked").

## Workflow

### 1. Notice the trigger

Stop before any of these: saying done, fixed, passing, works, complete or
ready; committing, pushing or opening a PR; closing an issue; ticking a
task or acceptance-criteria box; writing a status line for someone else to
paste. Paraphrases count ("all good", "should be fine", "ready for
review").

### 2. Pick the proving command

Take it from `AGENTS.md` → **Development and validation**, never from
memory or a guess. Today:

| Change | Proving command |
| --- | --- |
| A new or edited SOP (`*.sop.md`) | `bash .agents/skills/agent-sop/scripts/validate-sop.sh <file>`, once per file |
| A project skill in `.agents/skills/` | `bash .agents/skills/skill-intake/scripts/check-skill.sh <name>` |
| GitHub labels (`.github/labels.json`) | `node scripts/sync-labels.mjs` (dry run) shows no differences |
| Reference docs under `docs/reference/` | `node scripts/generate-docs.mjs`, then `git diff --stat` on the output |
| Anything else (PRD, README, ADRs, prose) | No automated check exists. Go to step 3's "no check" rule. |

When Rust or web test, lint and build commands are added to `AGENTS.md`,
they replace this table's guesswork: use exactly what `AGENTS.md` lists.

**No check exists:** say so in those words ("No automated check exists for
this change") and list what you did check by hand, with the command if
there was one (`git diff`, `grep`). Never write "verified", "tests pass" or
"CI green" when nothing ran, even if someone asks you to.

### 3. Run it fresh and in full

- Run it after your last edit. Output from before the edit, from earlier
  in the day, pasted by the user, or from another agent is history, not
  evidence. Compare file times if unsure (`stat`), then rerun anyway.
- Run it on **every** file or target you changed, not a sample. A file
  you were told to skip is still a changed file.
- If you scope a run down on purpose, the report must say what was left
  out.

### 4. Read the whole result

Read the exit code, the error and warning counts and every failure line.
A tool can stop at the first error (`validate-sop.sh` does), so a single
failure line may hide more; say so.

### 5. Compare with the baseline

Read `output/scratchpad/<project>/baseline.md`, written by
`workspace-setup` before the first edit.

For each failure now, classify it:

| Now | At baseline | Verdict |
| --- | --- | --- |
| Fails | Passed | **New failure** (regression). |
| Fails with a different message | Failed | **New failure.** The old failure may be fixed, but this one is yours. |
| Fails with the same message | Failed | Pre-existing. Report it as such, with both outputs. |
| Not run | Failed | **Unknown.** Never call it pre-existing without running it now. |

A baseline line is evidence about the past only. Never copy a baseline
result into a current report as if it were current.

No baseline file: say "No baseline was recorded, so new and pre-existing
failures cannot be told apart", and treat every failure as possibly new.

### 6. Check requirements line by line

A passing check is not "requirements met". Open the story issue's
acceptance criteria (or the `.code-task.md`'s) and mark each one:

- met, with the evidence (command output, file and line, diff);
- not met, with the reason;
- not verifiable, with what would verify it.

Only when every criterion is met may the PR say `Closes #N`. Otherwise
use `Part of #N` and list what is left.

### 7. Check delegated work yourself

A subagent's, separate session's or helper's "done" is a claim, not
evidence. Before passing it on: look at the diff (`git status`, `git diff`,
`git log`), confirm the change exists where it should, and rerun the
proving commands yourself. An empty diff means not done, whatever the
report says.

### 8. Report

Use this block in chat, the PR body's status section and issue comments:

```text
Verification
- <command> → exit <code>, <counts or key line>
- Baseline: <new failures / pre-existing failures / no baseline>
- Acceptance: [x] AC1 (<evidence>) [ ] AC2 (not met: <reason>)
- Not verified: <what and why, or "nothing">
```

Leave out the Acceptance line only when the work has no acceptance
criteria.

### 9. When verification fails

Report the real status with its output. Then fix it and rerun from
step 3, or hand it back saying what fails. Never soften the result
("mostly works", "minor issue"), and never write the status line that was
asked for if the evidence contradicts it; write the true one instead.

## Claims and the evidence they need

| Claim | Needs | Not enough |
| --- | --- | --- |
| Tests pass | Test command output after the last edit, 0 failures | An earlier run, "should pass" |
| Linter clean | Linter output, 0 errors | A partial run, extrapolation |
| Build succeeds | Build command, exit 0 | Lint passing, logs that look fine |
| SOP valid | `validate-sop.sh` exit 0 on each changed SOP | A run on some of them |
| Bug fixed | The original symptom reproduced, now gone | Code changed, assumed fixed |
| Regression test works | Seen failing without the fix, passing with it | Passing once |
| No regressions | Every changed target run now and compared with the baseline | A baseline line, a skipped target |
| Subagent finished | Your own look at the diff and rerun checks | Its "success" report |
| Requirements met | Each acceptance criterion marked with evidence | Checks passing |
| Docs change is fine | "No automated check exists" plus what you checked by hand | "Verified", "tests pass" |

## Common rationalisations

| Excuse | Reality |
| --- | --- |
| "It passed earlier." | Earlier is before the edit. Rerun it. |
| "It was already failing at baseline, skip it." | Run it. It may now fail for a new reason. |
| "It's a one-word change." | One word can delete a heading. Run it. |
| "The user told me to skip the check." | Skip it if you must, then report it as not verified. |
| "The senior dev says say it's verified." | Nobody can make an unrun check pass. Say what ran. |
| "The validator is green, so it's complete." | Green covers structure, not the acceptance criteria. |
| "The agent said success." | Read the diff. |
| "I'm confident." | Confidence is not output. |

## Red flags

Stop and go back to step 2 if you notice any of these in your own draft:

- "should", "probably", "seems to", "looks good", "I believe" next to a
  claim about the work;
- "Done!", "Perfect!", "All good" before any command ran this turn;
- a status line copied from the request, a baseline file or another agent;
- "pre-existing" for something you did not run now;
- "Closes #N" without a criterion-by-criterion check;
- about to commit, push or open a PR with no command output in this turn.

## Outputs

- The Verification block (step 8) in chat, PR bodies and issue comments.
- Nothing is written to the repository.

## Provenance

Adapted from the `verification-before-completion` skill in
https://github.com/obra/superpowers, path
`skills/verification-before-completion/`, commit
`2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`, MIT License, Copyright (c) 2025
Jesse Vincent. See `LICENSE`. Forge kept the core rule, the gate, the
claim/evidence table, the red-flag phrases and the rationalisations; it
added Forge's proving commands, the "no check exists" rule, the
`workspace-setup` baseline comparison, the acceptance-criteria walk and a
report format, and dropped the anecdotes and cross-references.
