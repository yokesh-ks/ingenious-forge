# Agent permissions

This policy says what a coding agent working on this repository may do
without asking, must ask about, and must never do. It applies to every
agent and every session, whoever set up the machine. Each agent implements
it in its own permission format; Claude Code's implementation is
[`.claude/settings.json`](../../.claude/settings.json).

This is about agents building Forge. Forge's own approval system is PRD
§6.1 and is unaffected.

## Policy

| Tier | Actions |
|---|---|
| **Allow** (no prompt) | Read files; `git status`, `diff`, `log`, `show`, `branch`, `fetch`; `git add`, `commit` (hooks still apply); `git switch` and `checkout -b`; `git worktree add` and `list`; `gh issue view` and `list`; `gh pr view`, `list`, `diff` and `checks`; `gh project item-list` and `field-list`; `node scripts/*`, `scripts/check-*.sh`, `scripts/test-hooks.sh`, `validate-sop.sh`, `check-skill.sh`; later the project's test, lint and build commands |
| **Ask** (confirm each time) | `git push` (not forced); `gh pr create`, `merge` and `comment`; `gh issue create`, `edit`, `close` and `comment`; `gh project item-add` and `item-edit`; `git worktree remove`; `git branch -d`; `node scripts/sync-labels.mjs --apply`; package installs; network fetches outside GitHub and package registries |
| **Deny** (never) | See the table below |

An action in no tier falls back to the agent's default, which for a
command or an edit should be to ask.

| Denied action | Reason |
|---|---|
| `git push --force`, `-f` or `--force-with-lease` to `main` | Rewrites shared history that others have pulled; the maintainer owns `main` (Principle IV) |
| `git reset --hard origin/main` on `main` | Discards local commits and uncommitted work with no undo |
| `git branch -D main` | Deletes the base branch every other branch is cut from |
| `git commit --no-verify` | Skips the shared commit hooks ([B1](https://github.com/yokesh-ks/ingenious-forge/issues/20)), which enforce commit titles, AI attribution and secret checks |
| `git config core.hooksPath` set to anything but `.githooks` | Turns the shared hooks off for every later commit, silently |
| `npm publish`, `npm dist-tag`, `npm unpublish` | Releases are outward-facing and irreversible; the maintainer runs them ([#14](https://github.com/yokesh-ks/ingenious-forge/issues/14) `release-launch`) |
| `gh repo edit`, `gh repo delete` | Changes or removes the repository for everyone |
| `gh api -X DELETE` against repository settings and rulesets | Removes protections such as the `main` ruleset ([B4](https://github.com/yokesh-ks/ingenious-forge/issues/23)) |
| `rm -rf` outside `output/`, `.worktrees/` and the agent's scratchpad | Deletes files with no undo; tracked work is recoverable only if committed |
| Reading `.env`, `*.pem` and credential files | Puts secrets into the agent's context and logs, where they can leak |

## Claude Code

The policy is implemented in `.claude/settings.json`, committed and shared,
under `permissions.allow`, `permissions.ask` and `permissions.deny`. Rule
syntax follows the
[Claude Code permissions documentation](https://code.claude.com/docs/en/permissions),
checked against Claude Code 2.1.310 on 2026-10-31.

How the rules behave:

- **Precedence.** Deny rules are checked first, then ask, then allow, in
  every settings scope. So `Bash(git commit *)` allows commits, while
  `Bash(git commit *--no-verify*)` in deny still blocks the bypass, and
  `Bash(git branch -d *)` in ask still prompts although `git branch *` is
  allowed. A user's own allow rule cannot override a project deny.
- **Prefix matching.** A Bash rule matches the command text Claude writes.
  Everything before the first `*` must match as written; `*` matches any
  text, spaces included. `Bash(git push *)` also matches bare `git push`.
- **Compound commands.** Commands joined by `&&`, `||`, `;`, `|` or a
  newline are split, and a deny or ask rule applies if any part matches,
  including inside `$(…)` and loops.
- **Read rules.** `Read(...)` uses gitignore patterns: `**/.env` matches a
  `.env` at any depth under the working directory, `~/` is the home
  directory. A Read deny also blocks the Edit and Write tools on that path,
  and Bash commands Claude Code recognises as reading a named file, such as
  `cat` and `head`.
- **Allow rules need trust.** Project allow rules apply only after the
  workspace trust dialog is accepted. Ask and deny rules always apply.

### Where the settings differ from the policy

A prefix rule cannot see which branch is checked out or which branch a
push targets, and cannot express "deny, except under these folders". Where
the policy's condition cannot be checked, the settings choose the stricter
side:

| Policy row | In `.claude/settings.json` | Why |
|---|---|---|
| Force-push to `main` | Every force-push is denied (`--force*`, `-f`, a `+` refspec) | `git push --force` with no refspec pushes the current branch, which the rule cannot see. Update a branch by merging `main` into it, not rebasing; the maintainer force-pushes by hand if one is needed |
| `git reset --hard origin/main` on `main` | Denied on every branch | The rule cannot see the current branch |
| `core.hooksPath` other than `.githooks` | Every `git config` that sets or unsets `core.hooksPath` is denied, and so is the bare read `git config core.hooksPath` | A deny cannot carve out one value; `scripts/setup-dev.sh` sets the correct value and is not matched; read the value with `git config --get core.hooksPath` |
| `gh api -X DELETE` on settings and rulesets | Every `gh api` DELETE is denied | The rule cannot tell an endpoint's meaning from its path reliably |
| `rm -rf` outside `output/`, `.worktrees/`, scratchpad | Every recursive `rm` written with a leading `-r`, `-R`, `-rf`, `-fr`, `-Rf`, `-fR` or `--recursive` is denied | Deny beats allow, so the three folders cannot be exempted. Use `git worktree remove` (ask) for worktrees; `output/` can be cleared by the maintainer |
| `git branch -D` | `-D` and `--delete` on any branch ask; `-D main` is denied | Force-deleting a non-`main` branch can lose unmerged work, so it is not allowed silently |
| Network fetches outside GitHub and package registries | The WebFetch tool may fetch `github.com`, `*.github.com`, `raw.githubusercontent.com`, `registry.npmjs.org`, `www.npmjs.com`, `crates.io` and `docs.rs` without asking; `curl` and `wget` ask | Other domains fall back to the session's default, which prompts in the default mode. An ask rule cannot exempt the allowed domains, because ask is checked before allow |
| Reading credential files | Denied: `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.test`, `*.pem`, `*.key`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `~/.ssh/`, `~/.aws/`, `~/.npmrc`, `~/.config/gh/hosts.yml`, `~/.git-credentials` | `.env.example`, `.env.sample` and `.env.template` stay readable, as in the pre-commit check; other `.env.*` names are not covered |

### Gaps and their fallbacks

These forms are not caught by the deny rules. The fallback is what stops
or limits them instead.

| Gap | Example | Fallback |
|---|---|---|
| Options before the git subcommand | `git -C . push --force`, `git -c x=y commit --no-verify` | B4 ruleset blocks force-push and deletion on `main`; B5 hooks |
| Combined short flags | `git push -uf`, `git commit -nm "x"` | B4 ruleset for pushes; CI `commits` check (B2) re-runs the commit rules on every PR |
| Program by path or through a shell | `/bin/rm -rf x`, `bash -c 'npm publish'`, `env npm publish` | npm 2FA on the package; B5 hooks |
| Flags after the operands | `rm src -rf`, `git branch main -D` | B4 ruleset protects `main` on the server; B5 hooks |
| Deleting `main` on the remote | `git push origin :main`, `git push origin --delete main` | `git push` asks; B4 ruleset blocks deletion |
| Hooks bypassed without the flag | `GIT_CONFIG_*` variables, editing `.git/config` | CI `commits` check (B2) |
| Other repository writes through `gh api` | `gh api -X PATCH repos/…`, `gh api graphql` mutations | Not allowed, so the session default prompts; B4 ruleset limits who can change `main` |
| Files read without naming them | `grep -r TOKEN .`, a script that opens `.env` | Keep secrets out of the working tree; pre-commit and CI keep them out of git |
| Rules that match more than meant | `-f` or `-n` inside a commit message or branch name | A false deny; reword the command |

OS-level sandboxing would close most of these and is out of scope.

### Personal overrides

Put personal rules in `.claude/settings.local.json`. It is Git-ignored, so
it never reaches the shared policy. A local allow rule cannot lift a
project deny rule.

## Implementing for another agent

To implement this policy for another agent, map each row to that agent's
permission or sandbox configuration:

- [ ] Find where the agent reads per-project permission config, and
  whether that file can be committed and shared. If it cannot, record the
  setup step in `AGENTS.md`.
- [ ] Find how the agent orders conflicting rules. If allow can override
  deny, the deny tier needs another mechanism (a hook or sandbox).
- [ ] Map each **Allow** row to rules that run without a prompt.
- [ ] Map each **Ask** row to rules that always prompt, including in any
  auto-approve mode the agent has.
- [ ] Map each **Deny** row to rules that block the action outright, and
  check each one against the reasons above.
- [ ] Map the credential-file denies to the agent's file-read rules or
  sandbox, and check whether a deny also blocks writes.
- [ ] Note how the agent matches commands (prefix, regex, parsed argv) and
  write down every form a rule misses, with its fallback, as in
  [Gaps and their fallbacks](#gaps-and-their-fallbacks).
- [ ] Keep personal overrides in a Git-ignored file, and add it to
  `.gitignore`.
- [ ] Run the [validation](#validation) steps in a fresh session of that
  agent and record the results in the pull request.
- [ ] Link the agent's config from this page.

## Validation

In a fresh agent session in this repository:

- `git status` runs without a prompt.
- `git push` asks.
- `git commit --no-verify -m "x"` and `git push --force` are blocked.

Run the push checks in a scratch clone whose remote is a local bare
repository, so a missed rule cannot reach GitHub.
