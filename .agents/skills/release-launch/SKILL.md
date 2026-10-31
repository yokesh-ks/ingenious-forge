---
name: release-launch
description: Use before publishing a Forge npm release. Runs a readiness check, derives the version from conventional commits, walks through the Forge-specific pre-launch checklist (OS binaries, npx smoke test, localhost binding, package contents, licences), stages the rollout through npm dist-tags, tags the release on GitHub, runs a post-launch check and keeps a written rollback plan ready. Every publish, tag or release action needs explicit maintainer approval. Triggers include "release Forge", "publish to npm", "launch v<x.y.z>", "cut a release", "ship this version".
license: MIT
---

# Release launch

Prepare and run a Forge npm release in a way that a bad publish can be
rolled back before reaching most users. Every step that touches npm, git
tags or GitHub releases requires explicit maintainer approval. Never run
`npm publish`, `npm dist-tag`, `git tag` or `gh release create`
unprompted.

**Delivery stage:** 11 (Release). Build this skill before the first npm
publish (end of PRD Phase 0 or Phase 1 MVP). Do not invoke it before the
npm launcher and binary packaging exist.

## When not to use it

- The npm launcher and cross-platform binaries do not exist yet (blocked
  by PRD Phase 0 work).
- You only want to finish a branch or open a PR (use `branch-finishing`).
- You want to verify that code works without releasing it (use
  `verify-before-done`).

---

## Workflow

### 1. Readiness

Confirm all three gates before doing anything else:

1. **Milestone closure.** Every story in the release milestone is closed
   or explicitly deferred. Check with:

   ```bash
   gh issue list --milestone "<milestone>" --state open \
     --json number,title,labels
   ```

   If open stories remain, list them and ask the user whether to proceed.
   If they decline, stop.

2. **No open Critical findings.** Run `verify-before-done` on `main`.
   If it reports Critical or Important findings, stop: resolve them first.

3. **`main` is green.** Confirm the latest CI run on `main` passed:

   ```bash
   gh run list --branch main --limit 5
   ```

   If the most recent run failed, stop.

If any gate is missing, say which and stop. Do not move to step 2 until
all three are clear.

---

### 2. Version

Derive the next version from the conventional commits since the last tag.

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
if [ "$LAST_TAG" = "none" ]; then
  git log --oneline
else
  git log --oneline "${LAST_TAG}..HEAD"
fi
```

Apply these rules (semver; while below 1.0.0, breaking changes bump the
minor, not the major):

| Commit type | Version bump |
| --- | --- |
| `feat` | minor |
| `fix`, `perf`, `refactor`, `docs`, `chore`, `ci`, `test`, `build` | patch |
| any type with `!` or body contains `BREAKING CHANGE:` | major (or minor while < 1.0.0) |

Present the derived version to the user:

> The next version based on commits since `<last-tag>` is **v<x.y.z>**.
> Approve, or enter a different version.

Wait for their answer. Use the confirmed version for all remaining steps.
Record it as `$VERSION` (e.g. `1.0.0`, without the `v` prefix).

---

### 3. Pre-launch checklist

Work through every item below. For each item record one of:
**✓ passed**, **✗ failed** (with reason), or **— skipped** (with reason).
Do not move to step 4 until all items are ✓ or the user accepts a skip
with a written reason.

Use `references/pre-launch-checklist.md` as the working document: copy
it to `output/planning/release-v${VERSION}/pre-launch-checklist.md` and
fill in the result column.

#### 3a. Binaries built

Confirm that a binary exists for each PRD §8 target:

| Target | Path pattern |
| --- | --- |
| macOS arm64 | `dist/forge-macos-arm64` |
| macOS x64 | `dist/forge-macos-x64` |
| Linux x64 | `dist/forge-linux-x64` |
| Linux arm64 | `dist/forge-linux-arm64` |
| Windows x64 | `dist/forge-win-x64.exe` |

```bash
ls -lh dist/forge-*
```

All five must exist and be non-zero.

#### 3b. Launcher selects the right binary

Read the `bin` entry in `package.json` and confirm the launcher script
selects the correct platform binary on each OS. A manual trace or a unit
test output suffices; record what was checked.

Note (PRD R1): WSL users run the Linux binary; the launcher must not
attempt the Windows binary inside WSL.

#### 3c. Smoke test from the packed tarball

```bash
npm pack
TARBALL=$(ls ingenious-forge-*.tgz | tail -1)
npx "./$TARBALL"
```

The test passes when, on at least one OS:
- the server starts (no crash within 10 s);
- the browser opens to `http://localhost:<port>`;
- a prompt edits a file and the edit appears in the working directory.

This is the PRD §9 Phase 0 exit criterion. Record the OS and result.

#### 3d. localhost-only binding

Confirm the server binds to `127.0.0.1` (or `::1`) only, not `0.0.0.0`.
Check the server source or the output of:

```bash
npx "./$TARBALL" &
sleep 3
ss -tlnp 2>/dev/null | grep <port> || netstat -an | grep <port>
kill %1
```

This is PRD R3.

#### 3e. Package contents — no secrets

```bash
npm pack --dry-run 2>&1 | grep -E "^npm notice"
```

Review the file list. Confirm:
- No `.env`, `*.pem`, `id_rsa`, `*.key`, or credential files.
- No `node_modules/` unless intentional and size-approved.
- Binary files for all five targets are present.
- `LICENSE` and `NOTICE` are in the package root.

#### 3f. Third-party licences

Confirm that the licences of all bundled npm dependencies have been
reviewed and are compatible with Apache 2.0. A generated SBOM or the
output of `npx license-checker --summary` is sufficient evidence.

#### 3g. Release notes

Write the release notes from the merged PRs since the last tag:

```bash
LAST_TAG_DATE=$(git log -1 --format=%aI "$LAST_TAG" 2>/dev/null || echo "1970-01-01T00:00:00Z")
gh pr list --state merged --base main \
  --search "merged:>${LAST_TAG_DATE}" \
  --json number,title,mergedAt | jq -r '.[] | "- #\(.number) \(.title)"'
```

The notes must:
- Group changes by type (`feat`, `fix`, `docs`, …).
- Include a **Breaking changes** section if any `!` or `BREAKING CHANGE`
  commits are present.
- Contain no AI attribution.

Save to `output/planning/release-v${VERSION}/RELEASE_NOTES.md`.

#### 3h. Time to first response

Verify (or estimate from timing the smoke test) that a new user running
`npx ingenious-forge` for the first time reaches an agent response within
5 minutes (PRD §10). Record the measured or estimated time.

---

### 4. Staged rollout with npm dist-tags

**Stage 1 — publish to `next`**

Show the command; do not run it without approval:

```
npm publish --tag next
```

After the user approves and the publish succeeds, record the published
version:

```bash
npm info ingenious-forge dist-tags
```

**Stage 2 — dogfood testing**

The maintainer and anyone on the team should run:

```
npx ingenious-forge@next
```

for at least one session. There is no automated timer; ask the user when
they are satisfied and ready to promote.

**Stage 3 — promote to `latest`**

Show the command; do not run it without approval:

```
npm dist-tag add ingenious-forge@${VERSION} latest
```

Confirm the promotion:

```bash
npm info ingenious-forge dist-tags
```

---

### 5. Tag and GitHub release

**5a. Create the git tag**

Show the command; do not run it without approval:

```
git tag "v${VERSION}" -m "Release v${VERSION}"
git push origin "v${VERSION}"
```

**5b. Create the GitHub release**

Write the release body to a temp file from
`output/planning/release-v${VERSION}/RELEASE_NOTES.md`, then show the
command; do not run it without approval:

```
gh release create "v${VERSION}" \
  --title "v${VERSION}" \
  --notes-file <release-notes-tmp>
```

**5c. Close the milestone**

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh api "repos/${REPO}/milestones" \
  --jq '.[] | select(.title=="<milestone>") | .number'
# then:
gh api --method PATCH \
  "repos/${REPO}/milestones/<n>" \
  -f state=closed
```

Show the command; confirm with the user before running.

---

### 6. Post-launch check

Within 48 hours of promoting to `latest`, check the following. Record
results in `output/planning/release-v${VERSION}/post-launch.md`.

1. **Fresh install.** Run `npx ingenious-forge@latest` on a clean machine
   or container (no prior install). Confirm the smoke test from step 3c
   still passes.

2. **New issues.** Check for issues opened after the release:

   ```bash
   SINCE=$(date -u -v-48H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
           date -u --date '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)
   gh issue list --state open \
     --search "created:>${SINCE}" \
     --json number,title,labels
   ```

   Triage any `bug` or `P0`/`P1` issues. If a critical bug is found,
   move to the rollback plan (step 7).

3. **npm download count** (optional, informational):

   ```bash
   npm info ingenious-forge --json | jq '.dist-tags, .time["${VERSION}"]'
   ```

---

### 7. Rollback plan

**Write this plan before publishing in step 4.** Save it to
`output/planning/release-v${VERSION}/rollback-plan.md` using the
template in `references/rollback-plan-template.md`.

Fill in:
- The previous `latest` version (from `npm info ingenious-forge dist-tags`
  before the publish).
- Any SQLite or session-log schema changes introduced in this version
  (forward-compatible or documented downgrade steps).
- The estimated time to execute the rollback.

**Rollback procedure (for reference; every step needs approval):**

1. Move `latest` back to the previous version:
   ```
   npm dist-tag add ingenious-forge@<prev> latest
   ```

2. Deprecate the bad version with a message:
   ```
   npm deprecate ingenious-forge@${VERSION} "Known issue: <reason>. Use <prev>."
   ```

3. If the schema changed in a breaking way, post a migration note in the
   GitHub release and open a bug issue.

4. **Unpublishing** is a last resort: npm allows unpublishing within 72 hours
   of publication if no other package depends on it. This requires explicit
   maintainer approval and registry support confirmation.

---

## Common rationalisations

| Excuse | Reality |
| --- | --- |
| "The smoke test passed on my machine." | Step 3c requires testing from the packed tarball, not the dev tree. |
| "The CI is green so it's fine to publish." | CI does not test the tarball or the binary picker on every OS. The checklist does. |
| "I'll write the rollback plan after publishing." | The rollback plan is required before step 4. No plan, no publish. |
| "It's just a patch release; the full checklist isn't needed." | Every release runs the full checklist. Skip items with a written reason only. |
| "I'll promote to `latest` right away." | Dogfood on `next` first. The staged rollout exists because bad publishes reach every `npx` user immediately. |
| "npm publish is just one command." | Show it; wait for approval. Do not run it unprompted. |
| "I'll add the release notes later." | Notes go in the GitHub release at the time of tagging. Write them from the PRs, not from memory. |

## Red flags

Stop and check if you notice any of these:

- About to run `npm publish` without explicit maintainer approval.
- About to run `npm dist-tag` without explicit approval.
- About to create a git tag or GitHub release without explicit approval.
- About to close the milestone without checking all stories are closed or
  deferred.
- About to skip the rollback plan.
- About to skip the smoke test from the packed tarball.
- About to publish when the pre-launch checklist has a ✗ item the user
  has not explicitly accepted.
- About to promote to `latest` before dogfood testing on `next`.
- Release notes contain AI attribution.

## Outputs

- `output/planning/release-v${VERSION}/pre-launch-checklist.md` — filled
  checklist.
- `output/planning/release-v${VERSION}/RELEASE_NOTES.md` — release notes.
- `output/planning/release-v${VERSION}/rollback-plan.md` — filled rollback
  plan.
- `output/planning/release-v${VERSION}/post-launch.md` — post-launch check
  results.
- A git tag `v${VERSION}` pushed to origin.
- A GitHub release at `v${VERSION}` with the release notes.
- npm dist-tags: `next` (after step 4 stage 1), `latest` (after stage 3).

## Provenance

Adapted from the `shipping-and-launch` skill in
https://github.com/addyosmani/agent-skills, path
`skills/shipping-and-launch/`, commit `eb07f19f52c2669f2364897aaa293e2aaddd7b1c`,
MIT License, Copyright (c) 2025 Addy Osmani. See `LICENSE`. Forge kept:
the pre-launch checklist structure, the staged rollout pattern, the
post-launch verification step, the rollback plan requirement, the
"Common rationalisations" and "Red flags" tables. Forge adapted the
checklist areas to Forge's `npx` delivery model (PRD §1, §8) and added
the OS binary checks, the smoke test from the packed tarball (PRD §9),
the localhost-only binding check (PRD R3), the WSL launcher note (PRD R1),
the time-to-first-response check (PRD §10), the npm dist-tag staged
rollout, and the deprecation and unpublish steps. Forge dropped: server-side
feature flags, error budgets, and production monitoring dashboards (Forge
runs locally; revisit for PRD Phase 4 Cloud).
