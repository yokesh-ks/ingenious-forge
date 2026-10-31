# Contributing to Ingenious Forge

Welcome! Ingenious Forge is an open-source, web-native coding harness
licensed under [Apache 2.0](LICENSE). This guide covers how to contribute —
whether you are a person, an AI coding agent, or a person working with one.

For what Forge does and where it is headed, see the
[product requirements document](docs/PRD.md). For the full agent guidance,
skills and principles that govern the repository, see
[`AGENTS.md`](AGENTS.md).

## Setup

```bash
git clone https://github.com/yokesh-ks/ingenious-forge.git
cd ingenious-forge
scripts/setup-dev.sh
```

`setup-dev.sh` sets `core.hooksPath` to `.githooks/`, which enables the
shared git hooks for commit messages, attribution checks and branch guards.
Run it once after cloning.

There is no application build step yet. Once toolchains are introduced, the
setup script will install them and this section will be updated.

## How work flows

Every change moves through the project board:

```
Backlog → Todo → In Progress → In Review → Done
```

Features follow a staged delivery flow — from product planning through
spec, build, verify, review, integrate and release — with skills at each
stage and human gates between them. The full stage table is in the
[feature delivery doc](docs/feature-delivery.md), and the
[`AGENTS.md` § Feature delivery](AGENTS.md#feature-delivery) section
summarises the entry points and non-skippable stages.

## Picking and claiming work

Work is tracked on the
[IngeniousForge project board](https://github.com/users/yokesh-ks/projects/34).
Before starting:

1. Pick an issue whose status is **Todo** and whose blockers are closed.
2. Assign yourself, move the issue to **In Progress**, and post a claim
   comment.
3. One story per session, one branch per story.

If another In Progress issue touches the same files, pick different work or
ask. The full rules — claiming, collision avoidance, handoff and session
hygiene — are in the
[working agreements](docs/process/working-agreements.md).

## Branches, commits and PRs

**Branches** are named `<type>/<short-kebab-slug>[-<issue>]`, where `type`
is one of `feat`, `fix`, `docs`, `chore`, `refactor` or `test`. Branch
from an up-to-date `origin/main`.

**Commits** use [Conventional Commits](https://www.conventionalcommits.org/)
titles: `type(scope): subject`, at most 72 characters, no trailing period.
The `commit-msg` hook enforces this.

**No AI attribution.** Commits, PRs, issues, docs and code must not carry
AI `Co-Authored-By` trailers, "Generated with" lines or similar markers.
The maintainer is the author of record. The hooks and CI enforce this rule.

**Pull requests** land by squash merge (rebase is also allowed) with every
CI check green. `main` is protected: direct pushes, force pushes and
deletion are blocked. Link the issue in the PR body (`Closes #N`). See
[branch protection](docs/process/branch-protection.md) for the full
ruleset.

## Checks

The shared git hooks (`.githooks/`) and CI
(`.github/workflows/repo-hygiene.yml`) enforce the same rules. Run them
locally before opening a PR:

```bash
scripts/check-all.sh
```

This runs every CI check on your working tree: conventional commits,
AI attribution, skill structure, SOP validation, licence notices, link
integrity and banned names. The only check it skips is `pr-body`, which
needs a pull request.

Individual checks live in `scripts/check-*.sh`; see the CI table in
[`AGENTS.md` § Continuous integration](AGENTS.md#continuous-integration)
for what each one catches.

## Using AI coding agents

AI coding agents are welcome contributors. They follow the same process as
anyone else, guided by [`AGENTS.md`](AGENTS.md), which is designed to be
read by any agent at session start.

The human contributor stays responsible for every change an agent makes.
Spec approval, PR review and merge, releases and principle amendments are
human gates — agents must not approve or merge their own work
(Principle IV).

To wire a new coding agent to the repository, follow the checklist in
[agent adapters](docs/process/agent-adapters.md).

## Issues

File issues through the forms in `.github/ISSUE_TEMPLATE/`: **Epic**,
**Story**, **Bug** and **Chore**. Blank issues are disabled.

Feature ideas start in the [PRD](docs/PRD.md) before becoming issues.
Use `roadmap-planning` to break a product area into epics and stories.

Labels, priority and sizing are defined in
[`.github/labels.json`](.github/labels.json); each label's description
says when to apply it.

## Licensing

Contributions are licensed under [Apache 2.0](LICENSE), the same licence
as the project.

Third-party material (vendored skills, reference docs, borrowed code) must:

- Keep its own `LICENSE` file beside it.
- Be recorded in [`NOTICE`](NOTICE).

Use the [`skill-intake`](.agents/skills/skill-intake/) skill when adding,
adapting or vendoring a project skill — it handles placement, symlinks,
licence files and `NOTICE` entries.
