# Rollback plan template

Copy this file to `output/planning/release-v<VERSION>/rollback-plan.md`
and fill it in **before publishing** in step 4 of `release-launch`.
A release may not proceed until this plan is complete and reviewed.

---

## Release being rolled back

**Version:** <!-- e.g. 1.2.0 -->  
**Published at (UTC):** <!-- fill in after publishing; leave blank until then -->  
**Rollback author:** <!-- who executes the rollback -->  

---

## Trigger conditions

Describe the conditions that would cause this rollback to be executed.

| Trigger | Threshold |
| --- | --- |
| Critical bug affecting core functionality | Any confirmed P0 report |
| Data loss or corruption | Any confirmed report |
| Security vulnerability | Any confirmed finding of severity High or Critical |
| Server fails to start on a supported OS | Confirmed on ≥ 1 target |
| `npx ingenious-forge` fails for a new user | > 20 % of new installs in first 48 h |
| Other (describe): | |

---

## Previous stable version

**Previous `latest` version:** <!-- e.g. 1.1.3 -->  
**Confirm with:**
```bash
npm info ingenious-forge dist-tags
```

---

## Rollback steps

Every step below requires explicit maintainer approval before execution.

### Step 1 — Move `latest` to the previous version

```bash
npm dist-tag add ingenious-forge@<PREV_VERSION> latest
```

Confirm:
```bash
npm info ingenious-forge dist-tags
```

**Expected result:** `latest` points to `<PREV_VERSION>`.  
**Time estimate:** < 2 minutes.

### Step 2 — Deprecate the bad version

```bash
npm deprecate ingenious-forge@<VERSION> \
  "Known issue: <brief reason>. Please use <PREV_VERSION>."
```

**Expected result:** users running `npx ingenious-forge@<VERSION>` see a
deprecation warning.  
**Time estimate:** < 1 minute.

### Step 3 — Post a notice on the GitHub release

Edit the GitHub release for `v<VERSION>` to add a notice at the top:

> ⚠️ This release has a known issue: `<reason>`. Please use
> `npx ingenious-forge@<PREV_VERSION>` until a fix is published.

```bash
gh release edit "v<VERSION>" --notes-file <updated-notes-file>
```

**Time estimate:** < 5 minutes.

### Step 4 — Schema migration (if applicable)

Fill this section only if `v<VERSION>` introduced SQLite or session-log
schema changes that are not forward-compatible with `<PREV_VERSION>`.

| Schema area | Change type | Downgrade steps |
| --- | --- | --- |
| <!-- e.g. sessions table --> | <!-- e.g. added column --> | <!-- e.g. column is nullable; no action needed --> |

If a destructive schema change was introduced, write a migration note in
the GitHub release and open a bug issue with the `P0` and `bug` labels.

**No schema changes in this release?** Write "None."

### Step 5 — Unpublish (last resort)

Unpublishing removes the version from the npm registry entirely. It is
allowed by npm within 72 hours of publication if no other package depends
on the version.

**Conditions for unpublish (all must be true):**
1. The rollback trigger is a severe security vulnerability or data
   corruption.
2. Deprecation (step 2) is insufficient to protect users.
3. Fewer than 72 hours have elapsed since publication.
4. No package in the public registry depends on `ingenious-forge@<VERSION>`.
5. The maintainer explicitly approves.

**Command (do not run without approval):**
```bash
npm unpublish ingenious-forge@<VERSION>
```

---

## Post-rollback checks

After executing the rollback:

1. Confirm `npm info ingenious-forge dist-tags` shows the correct `latest`.
2. Run `npx ingenious-forge@latest` to confirm the previous version starts.
3. Check that `ingenious-forge@<VERSION>` shows the deprecation warning.
4. Open a bug issue for the root cause with labels `bug` and `P0`.
5. Communicate the rollback in the GitHub release notes.

---

## Time to roll back

**Estimated total time (steps 1–3):** <!-- e.g. < 10 minutes -->  
**Estimated total time (steps 1–5, if unpublish needed):** <!-- e.g. < 20 minutes -->

---

## Sign-off

**Plan reviewed by:** <!-- maintainer name -->  
**Reviewed at (UTC):** <!-- before publishing -->
