#!/bin/bash
set -uo pipefail

# Check that project skills are placed, linked, licensed and registered.
# Usage: check-skill.sh [<name> ...]   (no name checks every skill)
# Exits 1 if any check fails. Warnings do not fail.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

# Built-in agent commands and bundled skills a project skill must not shadow.
RESERVED="init review code-review security-review simplify loop schedule run
compact clear config memory help agents hooks mcp model status doctor cost
resume login logout plugin skills context export permissions"

ERRORS=0
WARNINGS=0

ok()   { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo "  ❌ $1"; ERRORS=$((ERRORS + 1)); }

# Print a frontmatter field's value from a SKILL.md (single-line values).
field() {
    awk -v key="$2" '
        NR == 1 && $0 != "---" { exit }
        NR > 1 && $0 == "---" { exit }
        index($0, key ":") == 1 {
            sub("^" key ":[ ]*", ""); gsub(/^"|"$/, ""); print; exit
        }' "$1"
}

check() {
    local name="$1" dir=".agents/skills/$1" skill=".agents/skills/$1/SKILL.md"
    echo "Skill: $name"

    if [[ "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        ok "name is kebab-case"
    else
        fail "name '$name' is not kebab-case"
    fi
    if [[ " $(echo $RESERVED) " == *" $name "* ]]; then
        fail "name '$name' clashes with a built-in agent command"
    fi

    if [ ! -f "$skill" ]; then
        fail "$skill not found"
        return
    fi

    local fm_name desc license
    fm_name="$(field "$skill" name)"
    desc="$(field "$skill" description)"
    license="$(field "$skill" license)"

    if [ "$fm_name" = "$name" ]; then
        ok "frontmatter name matches folder"
    else
        fail "frontmatter name '$fm_name' does not match folder '$name'"
    fi

    if [ -z "$desc" ]; then
        fail "frontmatter description is missing"
    else
        if [ "${#desc}" -le 1024 ]; then
            ok "description is ${#desc} characters"
        else
            fail "description is ${#desc} characters (max 1024)"
        fi
        if [[ "$desc" == "Use when"* ]]; then
            ok "description starts with \"Use when\""
        else
            warn "description does not start with \"Use when\" (advice only for vendored skills)"
        fi
    fi

    local lines
    lines="$(wc -l < "$skill" | tr -d ' ')"
    if [ "$lines" -le 300 ]; then
        ok "SKILL.md is $lines lines"
    else
        warn "SKILL.md is $lines lines; move heavy material into references/"
    fi

    local missing=0 ref
    while IFS= read -r ref; do
        if [ ! -e "$dir/$ref" ]; then
            fail "linked file $dir/$ref does not exist"
            missing=1
        fi
    done < <(grep -oE '\]\((references|scripts)/[^)#]+' "$skill" | sed 's/^](//' | sort -u)
    [ "$missing" -eq 0 ] && ok "linked references and scripts exist"

    local link=".claude/skills/$name" target
    if [ -L "$link" ]; then
        target="$(readlink "$link")"
        if [ "$target" != "../../.agents/skills/$name" ]; then
            fail "$link points to '$target', expected '../../.agents/skills/$name'"
        elif [ -f "$link/SKILL.md" ]; then
            ok "$link resolves"
        else
            fail "$link does not resolve"
        fi
    else
        fail "$link symlink is missing"
    fi

    if [ -n "$license" ]; then
        if [ -f "$dir/LICENSE" ]; then
            ok "license '$license' has $dir/LICENSE"
        else
            fail "license '$license' set but $dir/LICENSE is missing"
        fi
        # NOTICE entries wrap across lines; compare with whitespace collapsed.
        local notice
        notice="$(tr -s ' \n' '  ' < NOTICE)"
        if [[ "$notice" == *"- $dir/ is derived from https://"*"Copyright (c) "*", under the "*". See $dir/LICENSE."* ]]; then
            ok "NOTICE entry present"
        else
            fail "NOTICE has no entry in the adhd format for $dir/"
        fi
    else
        if [ -f "$dir/LICENSE" ]; then
            fail "$dir/LICENSE exists but frontmatter has no license field"
        else
            ok "no third-party licence (new skill)"
        fi
    fi

    if grep -qE "^ +- \`$name/\`: " AGENTS.md; then
        ok "registered in AGENTS.md"
    else
        fail "no \`$name/\` bullet under .agents/skills/ in AGENTS.md"
    fi
}

if [ $# -eq 0 ]; then
    set -- $(ls .agents/skills)
fi
for name in "$@"; do
    check "${name%/}"
    echo ""
done

echo "Errors: $ERRORS  Warnings: $WARNINGS"
[ "$ERRORS" -eq 0 ]
