#!/bin/sh
# Check every project skill in .agents/skills/: SKILL.md frontmatter, the
# .claude/skills/ symlink, LICENSE and NOTICE for third-party skills, and
# registration in AGENTS.md. CI job: skills.
#
# The checks live in skill-intake's check-skill.sh so that skill and CI
# apply the same rules; this wrapper only gives CI a stable entry point.
#
# Usage: scripts/check-skills.sh [<name> ...]   (default: every skill)

root=$(cd "$(dirname "$0")/.." && pwd)
exec bash "$root/.agents/skills/skill-intake/scripts/check-skill.sh" "$@"
