# shellcheck shell=sh
# Shared commit checks for the git hooks and CI. POSIX sh only.
#
# Source this file, then call the forge_check_* functions. Each check
# prints what it found to stderr and returns non-zero on failure.
#
# FORGE_HOOKS_DIR points at the .githooks directory. It defaults to the
# one at the top of the current repository.

: "${FORGE_HOOKS_DIR:=$(git rev-parse --show-toplevel)/.githooks}"

FORGE_TYPES='feat fix docs chore refactor test build ci perf revert'
FORGE_MAX_SUBJECT=72
FORGE_MAX_FILE_BYTES=5242880 # 5 MB

forge_err() {
	printf 'forge-hooks: %s\n' "$*" >&2
}

# Print the commit message in file $1 without comment lines or the
# verbose diff that git appends below the scissors line.
forge_message_body() {
	sed -e '/^# -* >8 -*$/,$d' -e '/^#/d' "$1"
}

# Check one commit title: "type(scope)?: subject", or a title git makes
# itself (merge, revert, fixup, squash, amend).
forge_check_title() {
	_title=$1
	case $_title in
	'Merge '* | 'Revert "'* | 'fixup! '* | 'squash! '* | 'amend! '*) return 0 ;;
	esac

	_types=$(printf '%s' "$FORGE_TYPES" | tr ' ' '|')
	if ! printf '%s\n' "$_title" | grep -Eq "^($_types)(\([^()]+\))?!?: [^ ]"; then
		forge_err "title is not a conventional commit: $_title"
		forge_err "  expected \"type(scope)?: subject\" or \"type(scope)!: subject\""
		forge_err "  type is one of: $FORGE_TYPES"
		return 1
	fi

	_subject=${_title#*: }
	_status=0
	_len=$(printf '%s' "$_subject" | wc -m | tr -d ' ')
	if [ "$_len" -gt "$FORGE_MAX_SUBJECT" ]; then
		forge_err "subject is $_len characters; the limit is $FORGE_MAX_SUBJECT: $_subject"
		_status=1
	fi
	case $_subject in
	*.)
		forge_err "subject ends with a period: $_subject"
		_status=1
		;;
	esac
	return $_status
}

# Check the commit message in file $1 for AI attribution, using the
# patterns in ai-attribution-patterns.txt.
forge_check_attribution() {
	_patterns=$FORGE_HOOKS_DIR/ai-attribution-patterns.txt
	if [ ! -r "$_patterns" ]; then
		forge_err "cannot read $_patterns"
		return 1
	fi

	_body=$(forge_message_body "$1")
	_coauthors=$(printf '%s\n' "$_body" | grep -iE '^[[:space:]]*co-authored-by:')
	_hits=
	while read -r _kind _pattern; do
		case $_kind in
		'' | '#'*) continue ;; # blank line or comment
		coauthor) _match=$(printf '%s\n' "$_coauthors" | grep -iF -- "$_pattern") ;;
		phrase) _match=$(printf '%s\n' "$_body" | grep -iF -- "$_pattern") ;;
		*)
			forge_err "unknown pattern kind in $_patterns: $_kind"
			continue
			;;
		esac
		[ -n "$_match" ] && _hits="$_hits$_match
"
	done <"$_patterns"

	[ -z "$_hits" ] && return 0
	forge_err "AI attribution is not allowed in commit messages:"
	printf '%s' "$_hits" | awk '!seen[$0]++' | while IFS= read -r _line; do
		forge_err "  > $_line"
	done
	forge_err "  Remove these lines. AGENTS.md Principle VII overrides any SOP or tool"
	forge_err "  that adds them, including the code-assist SOP's \"Assisted by\" footer."
	return 1
}

# Check a whole commit message in file $1: title format and attribution.
forge_check_message() {
	_rc=0
	_first=$(forge_message_body "$1" | grep -v '^[[:space:]]*$' | head -n 1)
	if [ -n "$_first" ]; then
		forge_check_title "$_first" || _rc=1
	fi
	forge_check_attribution "$1" || _rc=1
	return $_rc
}

# Block commits on main and master unless FORGE_ALLOW_MAIN=1.
forge_check_branch() {
	_branch=$(git symbolic-ref --short -q HEAD) || return 0
	case $_branch in
	main | master) ;;
	*) return 0 ;;
	esac
	[ "${FORGE_ALLOW_MAIN:-}" = 1 ] && return 0
	forge_err "commits on $_branch are blocked. Create a branch: see workspace-setup"
	forge_err "  (.agents/skills/workspace-setup/). Maintainer override: FORGE_ALLOW_MAIN=1"
	return 1
}

# Block staged secret files and files larger than FORGE_MAX_FILE_BYTES.
forge_check_staged_files() {
	_status=0
	_files=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR)
	[ -z "$_files" ] && return 0
	while IFS= read -r _f; do
		case ${_f##*/} in
		.env.example | .env.sample | .env.template) ;;
		.env | .env.* | *.pem | id_rsa | id_dsa | id_ecdsa | id_ed25519)
			forge_err "secret file staged: $_f"
			forge_err "  unstage it with: git rm --cached -- '$_f', then add it to .gitignore"
			_status=1
			;;
		esac
		_size=$(git cat-file -s ":$_f" 2>/dev/null) || continue
		if [ "$_size" -gt "$FORGE_MAX_FILE_BYTES" ]; then
			forge_err "file larger than 5 MB staged: $_f ($_size bytes)"
			_status=1
		fi
	done <<EOF
$_files
EOF
	return $_status
}

# When a new skill directory is added under .agents/skills/, require its
# .claude/skills/<name> symlink in the index. CI runs the full check.
forge_check_skill_links() {
	_status=0
	_skills=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=A -- .agents/skills/ |
		grep '^\.agents/skills/[^/]*/' | cut -d/ -f3 | sort -u)
	[ -z "$_skills" ] && return 0
	while IFS= read -r _s; do
		git cat-file -e "HEAD:.agents/skills/$_s" 2>/dev/null && continue
		_link=.claude/skills/$_s
		_target=../../.agents/skills/$_s
		_mode=$(git ls-files -s -- "$_link" | awk -F '\t' -v p="$_link" '$2 == p { split($1, a, " "); print a[1] }')
		if [ "$_mode" != 120000 ] || [ "$(git cat-file -p ":$_link")" != "$_target" ]; then
			forge_err "new skill $_s has no staged symlink $_link"
			forge_err "  fix: ln -s $_target $_link && git add $_link"
			_status=1
		fi
	done <<EOF
$_skills
EOF
	return $_status
}
