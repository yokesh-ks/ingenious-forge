# 0015. Preview documents with PDF.js, FortuneSheet and a LibreOffice kit

- **Status:** Proposed
- **Date:** 2026-11-08
- **PRD:** §6.2 Workspace panel (File tab), §8 Architecture

## Context

The file tab must show PDFs, spreadsheets and Word and PowerPoint files as
readable documents rather than an "Open" button. The maintainer asked for
these previews to match the reference application exactly and to add
whatever that needs. Browsers cannot draw spreadsheets or Office files, and
their built-in PDF viewer cannot be styled, zoomed by our controls or sized
to the pane. Forge's server is Rust, but `npx ingenious-forge` already runs
under Node, so a Node helper is available wherever Forge is launched.

## Decision

Use `pdfjs-dist` for PDF pages and selectable text; `@fortune-sheet/react`
with `exceljs`, `xlsx`, `papaparse`, `fast-xml-parser` and `fflate` for
spreadsheets; and `@deepseek-ai/libreoffice-kit`, run by a Node helper the
launcher ships, to convert Word and PowerPoint files to PDFs. Run HTML
previews in a sandboxed frame that may execute scripts but has no access
to Forge.

## Alternatives considered

### The browser's own PDF viewer and a hand-written CSV grid

- Pros: no new dependency; this was the first version built.
- Cons: PDFs ignore the panel's zoom controls and page layout; a plain grid
  has no sheets, formats, merged cells or formula bar, and no Excel files.
- Rejected because: the previews would not match the required look, and
  Excel files would stay unreadable.

### Convert Office files with an installed `soffice`

- Pros: no large package; a few lines of Rust.
- Cons: most machines have no LibreOffice, so previews would silently be
  missing for most users, and no missing-font report is available.
- Rejected because: previews must work after `npx ingenious-forge` alone.

### Keep static, script-free HTML previews with a sanitizer

- Pros: nothing in the file runs.
- Cons: pages that build themselves with scripts appear blank, unlike the
  reference, and DOMPurify would be one more dependency.
- Rejected because: the sandbox already isolates the page from Forge.

## Consequences

- Good: PDF, Excel, CSV, Word, PowerPoint and HTML previews work in the
  panel; heavy code loads only when such a file is opened.
- Bad: the npm package grows by about 170 MB for the conversion engine, the
  launcher now needs Node 22.19 or newer, and the first conversion of a
  file takes several seconds. `npm audit` reports moderate advisories in
  these packages' dependencies, and SheetJS installs from its own CDN
  because npm only carries an old release. A previewed HTML page can run
  scripts and reach the network from its sandbox.
- Follow-up: the spreadsheet conversion is copied under
  `apps/web/src/features/workspace-panel/vendor/sheet/` with its licence.
