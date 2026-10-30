# Skill template

Copy the block below into `.agents/skills/<name>/SKILL.md` and replace every
`<…>` placeholder. Delete sections marked "(b only)" for new skills. A
vendored skill (c) keeps its upstream body; add only the `license` field if
upstream omits it.

````markdown
---
name: <name>
description: Use when <situation>, <symptom> or <trigger phrase>. <More triggers: errors, file names, things a user would type.>
license: <SPDX id, (b, c) only>
---

# <Title>

<One or two sentences: what this skill is for and the core principle.>

## When not to use it

- <Nearby situation where another skill or a direct answer is better.>

## Workflow

1. **<Step>.** <What to do, and how to tell it is done.>
2. **<Step>.** <…>

## Outputs

- `<path>`: <what is written there>.

## Red flags

- <Sign that the agent is going off the rails, and what to do instead.>

## Provenance (b only)

Adapted from <skill> in <upstream URL>, path `<path>`, commit `<full SHA>`,
<licence>, <copyright line>. See `LICENSE`. <One sentence on what Forge
kept and what it changed.>
````

## Description checklist

A description passes when all of these hold:

- It starts with "Use when".
- It names situations, symptoms or phrases, not steps.
- It does not say how the skill works ("spawns", "runs", "then", "first …
  then …", numbered phases).
- It is under 1024 characters.
- It is written about the situation, not to the agent ("Use when …", not
  "You should …").

Example, failing: "Classifies the request, checks the name, pins provenance
and writes the skill." This is a workflow summary; agents follow it and skip
the body.

Example, passing: "Use when adding a project skill to this repository … or
when asked to check whether an existing project skill is set up correctly."

## Skill types

Choose the type before writing the body; it decides what the body stresses
and how you test it (see [testing-skills.md](testing-skills.md)).

| Type | What it is | Body stresses |
| --- | --- | --- |
| Technique | Concrete steps to follow. | Numbered workflow, one worked example. |
| Pattern | A way of thinking about a problem. | When it applies, when it doesn't, a counter-example. |
| Reference | Facts to look up: APIs, commands, formats. | Fast retrieval: tables, headings, `references/` files. |
| Discipline | A rule agents are tempted to break. | The rule, a rationalisations table, red flags. |

## File organisation

```text
<name>/
  SKILL.md        # required; self-contained where possible, under ~300 lines
  LICENSE         # (b, c) upstream licence, unchanged
  references/     # heavy material (100+ lines): specs, API notes, templates
  scripts/        # reusable tools, run via their interpreter
```

Keep principles, short examples (under ~50 lines) and the workflow inline.
Link each supporting file from `SKILL.md` with a sentence saying when to read
or run it. Put one excellent example in the most relevant language rather
than several mediocre ones.
