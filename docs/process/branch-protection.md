# Branch protection

`main` is protected by a GitHub repository ruleset, **main protection**.
Changes reach `main` only through a pull request that passes the
repo-hygiene checks. History stays linear, and nobody, agent or human,
can force-push to `main` or delete it.

Local git hooks can be skipped and agent permissions cover only configured
agents. The ruleset is the server-side guarantee behind Principle IV
(humans own the gates). This page records its settings so they can be
reviewed and reapplied. The ruleset itself is
[`rulesets/main-protection.json`](rulesets/main-protection.json), in the
format of the GitHub REST rulesets API.

## Ruleset: main protection

| Setting | Value | Why |
|---|---|---|
| Target | Default branch (`main`) | |
| Enforcement | Active | |
| Restrict deletions | On | `main` cannot be deleted |
| Block force pushes | On | History on `main` is never rewritten |
| Require linear history | On | Clean history from squash or rebase merges |
| Require a pull request | On | No direct pushes |
| ↳ Required approvals | 0 | A solo maintainer cannot approve their own PR; the review gate is the maintainer merging it. See "Raising approvals" |
| ↳ Dismiss stale approvals on push | On | An approval covers only the commits it saw |
| ↳ Require conversation resolution | On | Review comments must be resolved before merging |
| ↳ Allowed merge methods | Squash (primary), rebase | The PR title becomes the commit title, and CI checks it |
| Require status checks | `commits`, `pr-body`, `skills`, `sop`, `notice`, `links`, `prd-names` | The jobs of `.github/workflows/repo-hygiene.yml` (see `AGENTS.md`, "Continuous integration") |
| ↳ Require branches to be up to date | On | Checks run against the latest `main` |
| Bypass list | Repository admin, for pull requests only | The maintainer can merge their own PR; there is no direct-push loophole |

Status checks are pinned to the GitHub Actions app (`integration_id`
15368), so a status with the same name from another source does not count.
A check renamed in the workflow must be renamed here and in the JSON in
the same change, or every PR will wait for a check that never reports.

## Repository settings

These sit outside the ruleset, on the repository itself.

| Setting | Value |
|---|---|
| Merge commits | Off |
| Squash merging | On; commit message is the PR title and description |
| Rebase merging | On |
| Automatically delete head branches | On |
| Secret scanning | On (keep) |
| Push protection | On (keep) |

## Applying

The maintainer applies or changes these settings. An agent prepares the
change and applies it only with the maintainer's explicit approval.

Create the ruleset:

```bash
gh api -X POST repos/yokesh-ks/ingenious-forge/rulesets \
  --input docs/process/rulesets/main-protection.json
```

The live ruleset has id `26260094`; `gh api
repos/yokesh-ks/ingenious-forge/rulesets` lists it. To change it later,
edit the JSON in a PR, then after merging update the ruleset in place
(`<id>` below is that id):

```bash
gh api -X PUT repos/yokesh-ks/ingenious-forge/rulesets/<id> \
  --input docs/process/rulesets/main-protection.json
```

Apply the repository merge settings:

```bash
gh repo edit yokesh-ks/ingenious-forge \
  --enable-merge-commit=false --enable-squash-merge --enable-rebase-merge \
  --delete-branch-on-merge
gh api -X PATCH repos/yokesh-ks/ingenious-forge \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY
```

## Checking

Compare the live ruleset with the committed JSON. The API returns extra
fields (`id`, `source`, timestamps, `_links`), so keep only the ones the
JSON sets:

```bash
gh api repos/yokesh-ks/ingenious-forge/rulesets/<id> \
  | jq -S '{name, target, enforcement, conditions, bypass_actors, rules}' > /tmp/live.json
jq -S . docs/process/rulesets/main-protection.json > /tmp/committed.json
diff /tmp/committed.json /tmp/live.json
```

An empty diff means they match. If GitHub adds a rule parameter with its
default value, add it to the JSON so the next diff is empty.

Check the repository settings:

```bash
gh repo view yokesh-ks/ingenious-forge \
  --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge
gh api repos/yokesh-ks/ingenious-forge \
  --jq '{squash_merge_commit_title, squash_merge_commit_message, security_and_analysis}'
```

## Effect on local work

- `git push origin main` is rejected. Push a branch and open a PR.
- The `pre-commit` hook still lets the maintainer commit on `main` with
  `FORGE_ALLOW_MAIN=1`, but such a commit can only reach GitHub through a
  branch and a PR.
- Merging a branch into `main` locally is no longer a way to finish work;
  the merge happens on the PR.

## Raising approvals

When a second human maintainer joins, raise `required_approving_review_count`
to 1 in the JSON, add a `CODEOWNERS` file, and apply the change with the
`PUT` command above. Until then, a required approval would block every PR
the maintainer opens.

## Out of scope

- Rulesets for tags and releases; they come with release work (#14).
- `CODEOWNERS`, until there is more than one maintainer.
