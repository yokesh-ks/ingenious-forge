#!/usr/bin/env node
/**
 * generate-docs.mjs
 *
 * Reads .docs-input/pages.json and writes one markdown file per page into
 * docs/reference/deepseek-harness/. Each input entry follows the schema:
 *
 *   {
 *     "page_plan": { "id": "string", "title": "string" },
 *     "content": "string"
 *   }
 *
 * Output file naming: <page_plan.id>.md  (e.g. "1.md", "1.1.md")
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = join(ROOT, ".docs-input", "pages.json");
const OUTPUT_DIR = join(ROOT, "docs", "reference", "openhands");

function readPages() {
  if (!existsSync(INPUT_PATH)) {
    throw new Error(`Input file not found: ${INPUT_PATH}`);
  }
  const raw = readFileSync(INPUT_PATH, "utf8");
  let pages;
  try {
    pages = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${INPUT_PATH}: ${err.message}`);
  }
  if (!Array.isArray(pages)) {
    throw new Error(
      `Expected ${INPUT_PATH} to contain a JSON array of page objects.`
    );
  }
  return pages;
}

function validatePage(page, index) {
  const errors = [];
  if (!page || typeof page !== "object") {
    errors.push(`entry ${index} is not an object`);
    return errors;
  }
  const pp = page.page_plan;
  if (!pp || typeof pp !== "object") {
    errors.push(`entry ${index}.page_plan is missing or not an object`);
  } else {
    if (typeof pp.id !== "string" || pp.id.length === 0) {
      errors.push(`entry ${index}.page_plan.id must be a non-empty string`);
    }
    if (typeof pp.title !== "string" || pp.title.length === 0) {
      errors.push(`entry ${index}.page_plan.title must be a non-empty string`);
    }
  }
  if (typeof page.content !== "string") {
    errors.push(`entry ${index}.content must be a string`);
  }
  return errors;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")  // runs of non-alphanumerics -> single hyphen
    .replace(/^-+|-+$/g, "");      // trim leading/trailing hyphens
}

function sanitizeFileName(id, title) {
  // Build a readable, filesystem-safe file name: <id>-<slugified-title>
  const slug = slugify(title);
  const base = slug ? `${id}-${slug}` : id;
  // Strip any path separators just in case an id contains them.
  return base.replace(/[\/\\]/g, "_");
}

function main() {
  const pages = readPages();

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const validationErrors = [];
  pages.forEach((page, index) => {
    validationErrors.push(...validatePage(page, index));
  });
  if (validationErrors.length > 0) {
    throw new Error(
      `Validation failed for ${INPUT_PATH}:\n- ${validationErrors.join("\n- ")}`
    );
  }

  let written = 0;
  let skipped = 0;
  for (const page of pages) {
    const fileName = `${sanitizeFileName(page.page_plan.id, page.page_plan.title)}.md`;
    const outPath = join(OUTPUT_DIR, fileName);

    // Only write when the file doesn't already exist, so re-runs never
    // clobber hand-edited output. Remove this check to force overwrite.
    if (existsSync(outPath)) {
      skipped += 1;
      continue;
    }

    writeFileSync(outPath, page.content, "utf8");
    written += 1;
    console.log(`Wrote ${outPath}`);
  }

  console.log(
    `\nDone. ${written} file(s) written, ${skipped} already-existed, ${pages.length} total.`
  );
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
