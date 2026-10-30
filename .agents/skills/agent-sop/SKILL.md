---
name: agent-sop
description: "Run structured Agent SOP workflows for software projects. Use when the agent needs to: (1) analyze a repository and generate agent-facing documentation such as AGENTS.md, README.md, or architecture notes, (2) turn a rough feature or product idea into a researched design and implementation plan, (3) break a design or feature description into structured code task files, or (4) implement a code task with a guided TDD workflow."
---

# Agent SOP

Use this skill as a router for four bundled SOPs. Pick the matching workflow, read its reference file in full, then follow that SOP's required steps and constraints exactly.

## Choose the right SOP

| SOP | Read this file | Use it for |
| --- | --- | --- |
| `codebase-summary` | [references/codebase-summary.md](references/codebase-summary.md) | Repository analysis and generated docs such as `AGENTS.md`, `README.md`, architecture notes, and other summary artifacts |
| `pdd` | [references/pdd.md](references/pdd.md) | Prompt-Driven Development: turn a rough idea into clarified requirements, research, a detailed design, and an implementation plan |
| `code-task-generator` | [references/code-task-generator.md](references/code-task-generator.md) | Convert a PDD plan or feature description into structured `.code-task.md` files |
| `code-assist` | [references/code-assist.md](references/code-assist.md) | Implement a task with an Explore -> Plan -> Code -> Commit workflow grounded in TDD |

## Operating rules

1. Select exactly one SOP as the primary workflow unless the user explicitly wants a chained flow.
2. Read the selected reference file completely before taking task actions.
3. Ask for parameters only when the SOP requires them and they cannot be inferred safely.
4. Create artifacts in the locations required by the selected SOP.
5. Treat RFC 2119 language in the reference file as binding instructions.

## Typical chaining

For greenfield or larger feature work, the SOPs often chain in this order:

`codebase-summary -> pdd -> code-task-generator -> code-assist`

Use a single SOP when the user is entering at a later phase.

## Artifact locations

- `output/summary/` for `codebase-summary` outputs
- `output/planning/{project_name}/` for `pdd` outputs
- `output/tasks/{project_name}/` for `code-task-generator` outputs
- `output/scratchpad/{project_name}/` for `code-assist` working notes

Keep `output/` Git-ignored. It is transient workflow output, not
source-controlled project documentation.

## Reference loading guidance

- Read `references/codebase-summary.md` only for repository analysis and generated documentation work.
- Read `references/pdd.md` only for idea refinement, research, design, and implementation planning.
- Read `references/code-task-generator.md` only for turning plans or descriptions into task files.
- Read `references/code-assist.md` only for implementation execution.

Do not load unrelated reference files unless the workflow genuinely transitions into that phase.
