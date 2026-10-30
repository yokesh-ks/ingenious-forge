# Licensing skills

Forge is distributed under Apache 2.0. A third-party skill can be adapted
(b) or vendored (c) only if its licence lets Forge redistribute it, modified,
under Apache 2.0, including commercially.

## Where to find the licence

1. A `LICENSE` (or `LICENSE.md`, `COPYING`) file in the skill's own folder.
2. Otherwise, the repository root `LICENSE` at the pinned commit.
3. A `license` field in the upstream `SKILL.md` frontmatter only confirms
   the above; it is not enough on its own.

Read the whole file, not just the first line. Additions such as the Commons
Clause are appended to otherwise permissive licences.

## Decision table

| Licence | Decision | Why |
| --- | --- | --- |
| MIT, MIT-0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Zlib | Accept | Permissive and OSI-approved; keep the copyright notice. |
| Apache-2.0 | Accept | Same licence as Forge; also copy upstream `NOTICE` if there is one. |
| CC0-1.0, Unlicense | Accept | Public-domain dedication. |
| CC-BY-4.0 | Accept for text-only skills | Not OSI-approved for code, but permits redistribution with attribution. Do not use it for `scripts/`. |
| MPL-2.0 | Ask the maintainer | OSI-approved, file-level copyleft: modified files must stay MPL. |
| LGPL, GPL, AGPL (any version) | Reject | Copyleft terms conflict with distributing Forge under Apache 2.0 (GPLv2 is incompatible outright). |
| Any licence plus the Commons Clause | Reject | Forbids selling the software, so it is not open source and not OSI-approved. |
| CC-BY-NC, CC-BY-ND, "non-commercial", "no derivatives" | Reject | Restricts use or modification; not open source. |
| BUSL, SSPL, Elastic License, "source available" | Reject | Not OSI-approved; restricts use. |
| No licence, or "all rights reserved" | Reject | No permission to copy at all. |
| Anything else | Ask the maintainer | Check the OSI list at https://opensource.org/licenses before going further. |

### Explaining a rejection

Tell the user which licence it is, the clause that blocks it, and the
alternative. For example:

> The upstream skill is MIT with the Commons Clause appended. The Commons
> Clause forbids selling the software, so it is not an open-source licence
> and Forge cannot redistribute it under Apache 2.0. I can write a new skill
> from the general idea instead, without copying its text.

A rejected skill must not be copied in part either. A new skill (a) may
follow the same idea but must be written independently.

## `LICENSE` file

Copy the upstream licence file into `.agents/skills/<name>/LICENSE`
unchanged. Do not reformat it, update the year or add Forge's name. If
upstream also has a `NOTICE`, copy it to `.agents/skills/<name>/NOTICE`.

## `NOTICE` entry

Add one entry per skill to the root `NOTICE`, in the bulleted list of
third-party material, after the existing skill entries and before the
`docs/reference/<project>/` entry. Wrap lines at 72 columns or less and
indent continuation lines by two spaces.

### Template

```text
- .agents/skills/<name>/ is derived from <upstream repository URL>,
  Copyright (c) <year> <holder>, under the <licence name>. See
  .agents/skills/<name>/LICENSE.
```

- `<upstream repository URL>` is the repository, not the commit or file
  URL. The commit SHA goes in the skill's provenance note and the commit
  message.
- The copyright line is copied from the upstream `LICENSE`.
- `<licence name>` is the licence's name with "the", for example "MIT
  License" or "Apache License, Version 2.0".
- Use "is derived from" for both adapted and vendored skills.
- Rewrap if the URL is long, keeping each placeholder on its own line where
  possible.

### Worked example: `adhd`

The existing entry, which every new entry must match in wording and shape:

```text
- .agents/skills/adhd/ is derived from https://github.com/UditAkhourii/adhd,
  Copyright (c) 2026 ADHD contributors, under the MIT License. See
  .agents/skills/adhd/LICENSE.
```

And `skill-intake` itself:

```text
- .agents/skills/skill-intake/ is derived from
  https://github.com/obra/superpowers, Copyright (c) 2025 Jesse Vincent,
  under the MIT License. See .agents/skills/skill-intake/LICENSE.
```

## Checklist (b, c)

- [ ] Licence read in full and accepted by the table above.
- [ ] Upstream URL, full commit SHA, path and copyright line recorded.
- [ ] `LICENSE` copied unchanged into the skill folder.
- [ ] `license:` SPDX identifier in `SKILL.md` frontmatter.
- [ ] `NOTICE` entry added in the template's format.
- [ ] `AGENTS.md` bullet names the source and licence.
