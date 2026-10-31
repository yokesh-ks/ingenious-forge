# Pre-launch checklist

Copy this file to `output/planning/release-v<VERSION>/pre-launch-checklist.md`
before starting step 3 of `release-launch`. Fill the **Result** column as
you work through each item. Every item must be ✓ or have an accepted skip
with a written reason before publishing.

**Version:** <!-- fill in -->  
**Date:** <!-- fill in -->  
**Checked by:** <!-- fill in -->

---

## Binaries

| Item | Result | Notes |
| --- | --- | --- |
| `dist/forge-macos-arm64` exists and is non-zero | | |
| `dist/forge-macos-x64` exists and is non-zero | | |
| `dist/forge-linux-x64` exists and is non-zero | | |
| `dist/forge-linux-arm64` exists and is non-zero | | |
| `dist/forge-win-x64.exe` exists and is non-zero | | |

## Launcher

| Item | Result | Notes |
| --- | --- | --- |
| Launcher selects `macos-arm64` on Apple Silicon | | |
| Launcher selects `macos-x64` on Intel Mac | | |
| Launcher selects `linux-x64` on Linux x64 | | |
| Launcher selects `linux-arm64` on Linux ARM | | |
| Launcher selects `win-x64.exe` on Windows x64 | | |
| Launcher selects `linux-*` binary when running inside WSL (PRD R1) | | |

## Smoke test (packed tarball)

Run from the packed tarball (`npm pack`, then `npx ./ingenious-forge-<v>.tgz`).

| Item | Result | Notes |
| --- | --- | --- |
| OS and version used for smoke test | | |
| Server starts within 10 s (no crash) | | |
| Browser opens to `http://localhost:<port>` | | |
| A prompt edits a file; the edit appears in the working directory | | |

## Security

| Item | Result | Notes |
| --- | --- | --- |
| Server binds to `127.0.0.1` or `::1` only — not `0.0.0.0` (PRD R3) | | |
| No `.env`, `*.pem`, `id_rsa`, `*.key` in `npm pack --dry-run` file list | | |
| No unreviewed credential or config files in the package | | |

## Package contents

| Item | Result | Notes |
| --- | --- | --- |
| `LICENSE` is in the package root | | |
| `NOTICE` is in the package root | | |
| All five platform binaries are present in the package | | |
| `node_modules/` absent (or intentional and size-approved) | | |
| Total package size is reasonable (note size) | | |

## Licences

| Item | Result | Notes |
| --- | --- | --- |
| All bundled npm dependency licences reviewed | | |
| All bundled licences are Apache-2.0-compatible | | |
| `SBOM` or `license-checker` output recorded | | |

## Documentation and release notes

| Item | Result | Notes |
| --- | --- | --- |
| Release notes written from merged PRs (no AI attribution) | | |
| Release notes grouped by commit type | | |
| Breaking changes section present (if applicable) | | |

## Performance

| Item | Result | Notes |
| --- | --- | --- |
| Time to first agent response for a new user is ≤ 5 min (PRD §10) | | |

## Rollback plan

| Item | Result | Notes |
| --- | --- | --- |
| `rollback-plan.md` written and reviewed before publishing | | |
| Previous `latest` version recorded in the rollback plan | | |
| Schema migration notes included (if applicable) | | |

---

## Summary

**All items ✓?** <!-- yes / no -->  
**Skipped items (with reasons):** <!-- list or "none" -->  
**Ready to publish:** <!-- yes / no -->
