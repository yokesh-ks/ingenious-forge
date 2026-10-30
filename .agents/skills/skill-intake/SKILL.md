---
name: skill-intake
description: Use when adding a project skill to this repository, whether written from scratch, adapted from another repository's skill, or vendored (copied) from one; when renaming or relicensing a skill in .agents/skills/; or when asked to check whether an existing project skill is set up correctly. Triggers include "add the X skill", "port this skill", "vendor this skill", "make a skill for Y", and "is the X skill compliant".
license: MIT
---

# Skill intake

The standard way to bring a skill into Forge so it ends up correctly placed,
linked, licensed, recorded and tested. A skill is only finished when every
step below is done; a `SKILL.md` on its own is not a finished skill.

Treat a skill like code: watch an agent fail without it before you write it,
then watch the same agent succeed with it.

## When not to use it

- Editing the body of an existing skill without changing its name, licence
  or source: follow the test steps (4 and 9) only.
- Personal or user-level skills outside this repository.
- Packaging skills for distribution or a marketplace (out of scope).
- Conventions that a script or lint rule can enforce: automate them instead.

## Workflow

Work through every step in order. Steps marked (b, c) apply only to adapted
and vendored skills.

### 1. Classify the request

| Type | Meaning | Example |
| --- | --- | --- |
| (a) new | Written from scratch for Forge. | A skill for Forge release notes. |
| (b) adapted | Rewritten for Forge using an upstream skill's ideas or text. | `skill-intake` itself, from superpowers `writing-skills`. |
| (c) vendored | Copied with minimal change, keeping upstream wording. | `adhd`. |

If any upstream text survives, it is (b) or (c), never (a). If you change
more than paths, frontmatter and Forge-specific cross-references, it is (b).

### 2. Check the name

The name is the folder name and the frontmatter `name`. It must:

- be kebab-case: lowercase letters, digits and single hyphens
  (`^[a-z0-9]+(-[a-z0-9]+)*$`);
- be a verb-noun or noun-noun phrase that says what the skill is for
  (`skill-intake`, `release-notes`), not a vague word (`helper`, `utils`);
- not match an existing folder in `.agents/skills/` or `.claude/skills/`;
- not shadow a built-in agent command or bundled skill. Check the slash
  commands and skills your agent lists for this session. Known clashes
  include `init`, `review`, `code-review`, `security-review`, `simplify`,
  `loop`, `schedule`, `run`, `compact`, `config`, `memory`, `help`,
  `agents`, `hooks`, `mcp`, `model`, `status` and `doctor`.

A vendored skill keeps its upstream name unless it fails this check; then
rename it and say so in the provenance note.

### 3. Pin provenance (b, c)

Record, before copying anything:

- upstream repository URL;
- full commit SHA (resolve a branch or tag to a SHA; never pin `main`);
- path of the skill in that repository;
- licence (SPDX identifier) and the exact copyright line from its `LICENSE`.

Then check the licence against
[references/licensing.md](references/licensing.md). If it is not
OSI-approved, or conflicts with Apache 2.0 distribution (for example the
Commons Clause, a non-commercial clause, or no licence at all), stop. Tell
the user which licence it is and why Forge cannot ship it, and offer to
write a new skill (a) from the ideas instead, without copying text.

If the upstream skill has no `LICENSE` of its own, use the repository's
root `LICENSE`.

### 4. Baseline test (red)

Required. Write 1–3 realistic scenarios in
`output/scratchpad/skills/<name>/scenarios.md`, run each with a fresh agent
that does not have the skill, and record what it did wrong, verbatim where
possible. Use the template and per-type guidance in
[references/testing-skills.md](references/testing-skills.md).

If you cannot start a fresh agent yourself, still write `scenarios.md`,
hand the scenarios to the user to run, and do not report them as passed.

If the baseline agent does everything right, the skill is not needed as
written. Stop and tell the user.

The maintainer may waive steps 4 and 9 for a pure wording fix (typos,
links, formatting). Record the waiver in the commit message. Nothing else
skips them.

### 5. Write the skill

Create `.agents/skills/<name>/SKILL.md` from
[references/skill-template.md](references/skill-template.md).

- **Frontmatter:** `name` (equal to the folder name), `description`, and
  for (b, c) `license` with the upstream SPDX identifier.
- **Description:** says only when to use the skill. Start with "Use
  when …", then triggers, symptoms and phrasings a user would type. Never
  summarise the workflow: an agent that reads a summary follows it and
  skips the body. Keep it under 1024 characters. A vendored skill keeps its
  upstream description unless it fails to trigger.
- **Body (a, b):** purpose, when not to use it, numbered workflow, outputs
  with paths, red flags, and for (b) a provenance note at the bottom.
- **Body (c):** keep the upstream text. Change only paths that would break
  in Forge and cross-references to skills Forge does not have.
- **Size:** keep `SKILL.md` under about 300 lines. Move heavy reference
  material into `references/` and reusable scripts into `scripts/`, and
  link each from the body with when to read or run it. Run bundled scripts
  through their interpreter (`bash scripts/x.sh`), never by bare path.
- **Agent-agnostic:** write for any agent. Name Claude Code-specific
  behaviour only where it matters, and say so.
- **No AI attribution** anywhere in the skill.

### 6. Link it

```bash
ln -s ../../.agents/skills/<name> .claude/skills/<name>
ls -l .claude/skills/<name>
ls .claude/skills/<name>/SKILL.md
```

The link must be relative and the last command must succeed.

### 7. Licensing (b, c)

- Copy the upstream `LICENSE` into `.agents/skills/<name>/LICENSE`
  unchanged, byte for byte.
- Add a `NOTICE` entry, in the list of third-party material and before the
  `docs/reference/` entry, using the template in
  [references/licensing.md](references/licensing.md). Match the existing
  `adhd` entry's wording and wrapping exactly.

A new skill (a) gets neither: it is covered by Forge's own Apache 2.0
licence.

### 8. Register it

Add a bullet under `AGENTS.md` → Repository layout → `.agents/skills/`:

```markdown
  - `<name>/`: <one-line purpose>.
```

For (b, c) append the source, as the `adhd` bullet does:
`adapted from <url> (MIT, see its `LICENSE`)` or `vendored from <url> …`.
If the skill should be picked up from the front door, add it to the
**Front door** section too.

### 9. Green test

Required (unless waived in step 4). Rerun the step 4 scenarios with a fresh
agent that has the skill. For each failure, tighten the skill and rerun.
Record before and after for each scenario in
`output/scratchpad/skills/<name>/results.md`; this goes in the PR
description.

### 10. Check and commit

Run the checker and fix every error:

```bash
bash .agents/skills/skill-intake/scripts/check-skill.sh <name>
```

Commit with `feat(skills): add <name> skill`. For (b, c) name the upstream
URL and commit SHA in the body. No `Co-Authored-By` trailers, "Generated
with" lines or SOP footers.

## Check mode

When asked whether an existing skill is compliant, change nothing. Run
`bash .agents/skills/skill-intake/scripts/check-skill.sh <name>` (or with no
argument for every skill), then review what the script cannot judge:

- the request type you would classify it as, and whether its provenance
  matches (step 3);
- whether the description is trigger-only (step 5); vendored skills keep
  upstream wording, so report this as advice, not a failure;
- whether the body has the required sections for its type.

Report each item as compliant, warning or error, with the fix for each
non-compliant item. Do not fix anything until the user asks.

## Outputs

- `.agents/skills/<name>/SKILL.md`, plus `references/`, `scripts/` and
  (b, c) `LICENSE` as needed.
- `.claude/skills/<name>` symlink.
- (b, c) `NOTICE` entry.
- `AGENTS.md` bullet.
- `output/scratchpad/skills/<name>/scenarios.md` and `results.md`
  (Git-ignored; summarised in the PR).

## Common rationalisations

| Excuse | Reality |
| --- | --- |
| "The skill is obviously clear." | Clear to the author is not clear to another agent. Run the scenario. |
| "It's vendored, so upstream tested it." | Upstream tested it in their harness, not Forge's. Run the scenario. |
| "It's just a reference skill." | References have gaps. Test that an agent finds and applies the right part. |
| "I'll test it if problems come up." | Problems show up as agents silently ignoring the skill. Test first. |
| "The licence is probably fine." | Read the `LICENSE` file. "Probably" is how the Commons Clause gets shipped. |
| "NOTICE and AGENTS.md can follow later." | They are part of the skill. A later fix is what this skill exists to stop. |
| "The description should explain the steps." | Then agents follow the description and skip the body. Triggers only. |

## Red flags

Stop and go back a step if you notice any of these:

- writing `SKILL.md` before a baseline scenario has run;
- a provenance pin of `main`, `master` or a tag instead of a SHA;
- a `license` field with no `LICENSE` file beside it, or the reverse;
- a `NOTICE` entry worded differently from the `adhd` one;
- a symlink that is absolute or does not resolve;
- a description that lists the workflow steps;
- naming a competing product in `docs/PRD.md` while describing the skill.

## Provenance

Adapted from the `writing-skills` skill in
https://github.com/obra/superpowers, path `skills/writing-skills/`, commit
`2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`, MIT License, Copyright (c) 2025
Jesse Vincent. See `LICENSE`. Forge kept the test-first cycle, skill types,
the description rule, file organisation and the rationalisations table;
it dropped the plugin packaging and cross-references, and lets the
maintainer waive tests for pure wording fixes.
