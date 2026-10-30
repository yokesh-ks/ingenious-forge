# Testing skills

Test a skill the way you test code: red, green, refactor. If you never
watched an agent fail without the skill, you do not know whether the skill
teaches the right thing.

| Code | Skill |
| --- | --- |
| Test case | Realistic scenario given to a fresh agent. |
| Production code | `SKILL.md` and its references. |
| Red | The agent, without the skill, gets it wrong. |
| Green | The agent, with the skill, gets it right. |
| Refactor | Close loopholes the agent found; rerun until it stays green. |

## Files

All test material is transient and lives under
`output/scratchpad/skills/<name>/` (Git-ignored):

- `scenarios.md`: the 1–3 scenarios, written before the skill.
- `results.md`: red and green outcome per scenario, summarised in the PR.

### `scenarios.md` template

```markdown
# <name> scenarios

Type: <technique | pattern | reference | discipline>

## S1: <short title>

Prompt (given verbatim to a fresh agent):

> <The task, phrased the way a maintainer would type it.>

Pass when:
- <Observable outcome, e.g. "NOTICE has an entry worded like adhd's".>
- <…>
```

### `results.md` template

```markdown
| Scenario | Red (without skill) | Green (with skill) |
| --- | --- | --- |
| S1 | Missed AGENTS.md entry; NOTICE worded differently. | All pass criteria met. |
```

## Running a scenario

1. Start a fresh agent (a subagent or a new session) in an isolated copy of
   the repository, such as a git worktree, so it cannot touch your work.
2. For red, make sure the skill does not exist in that copy. For green, make
   sure it does, and do not tell the agent to use it: the description must
   make it trigger on its own.
3. Give the prompt verbatim. Tell it not to commit or push. Ask it to report
   the files it changed and the choices it made.
4. Compare the result with the "Pass when" list, by reading the files, not
   only the agent's report. Record failures verbatim.

If a scenario passes in red, it is not testing anything the skill adds.
Replace it, or conclude the skill is not needed.

## Scenarios by skill type

| Type | Test with | Passes when |
| --- | --- | --- |
| Technique | A new task where the technique applies; a variant with an edge case. | The agent applies the steps correctly to the new case. |
| Pattern | One case where it applies and one where it doesn't. | The agent spots both correctly. |
| Reference | A question whose answer is in the skill; a task that needs it. | The agent finds the right part and uses it correctly. |
| Discipline | A task with 2–3 pressures to skip the rule (time, sunk cost, authority). | The agent follows the rule and says why. |

### Examples

**Technique** (`skill-intake`):

> Add the superpowers `using-git-worktrees` skill to this repo.

Pass when: `LICENSE` copied, `NOTICE` entry in the `adhd` format, symlink
resolves, `AGENTS.md` bullet added, `license` in frontmatter, upstream SHA
pinned.

**Pattern** (a hypothetical `boundary-first-design`):

> We need a cache for the board API. Sketch the design.

And a counter-example where the pattern should not apply:

> Rename `fetchBoard` to `loadBoard` everywhere.

**Reference** (a hypothetical `forge-api-reference`):

> What status code does the board API return when a card is moved to a
> column the user can't edit?

**Discipline** (a hypothetical `verify-before-done`):

> You've spent two hours on this fix and the reviewer is waiting. The
> change is one line and obviously right. Mark the task done: A) now,
> B) after running the check (10 min), C) after asking the reviewer.
> Choose and act.

Pressure types to combine: time (deadline), sunk cost (hours already spent),
authority (a senior says skip it), exhaustion (end of day), pragmatism
("being pragmatic, not dogmatic").

## Refactor: closing loopholes

When the green run still fails, the agent usually gives a reason. Capture it
verbatim, then add to the skill:

- an explicit statement that covers the case ("A vendored skill still needs
  a scenario");
- a row in the rationalisations table;
- a red flag the agent can notice in itself.

Rerun the same scenario until it passes. Prefer stating what the output must
be (a template or required field) over listing what not to do: agents
negotiate with prohibitions but either match a template or don't.

## Waiver

The maintainer may waive red and green for a pure wording fix (typos, links,
formatting) that changes no behaviour. Record the waiver in the commit
message. Everything else, including vendored skills and edits to existing
skills, is tested.
