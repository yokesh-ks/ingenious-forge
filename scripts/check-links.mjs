#!/usr/bin/env node
/**
 * check-links.mjs
 *
 * Checks that relative markdown links point at files that exist. CI job:
 * links. External links (any URL scheme) and in-page anchors are skipped;
 * a link's #fragment is ignored. Links inside code blocks and code spans
 * are not links and are skipped.
 *
 * Checked: AGENTS.md, README.md, docs/**\/*.md and .agents/skills/**\/*.md.
 * docs/reference/** is generated and is not checked.
 *
 * Usage:
 *   node scripts/check-links.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATHSPECS = ["AGENTS.md", "README.md", "docs/**/*.md", ".agents/skills/**/*.md"];
const EXCLUDE = "docs/reference/";

const INLINE = /!?\[(?:[^\]\\]|\\.)*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const DEFINITION = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;

function markdownFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...PATHSPECS.map((p) => `:(glob)${p}`)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return out.split("\0").filter((f) => f && !f.startsWith(EXCLUDE));
}

// Yield [lineNumber, target] for each link outside code blocks and spans.
function* links(text) {
  let fence = null;
  // Track indented-code-block state: a run of lines indented by 4+ spaces
  // that is not part of a list item is treated as a code block.
  let blankBefore = true; // conservatively treat start-of-file as a blank
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      blankBefore = false;
      continue;
    }
    if (open) {
      fence = open[1];
      blankBefore = false;
      continue;
    }
    const isBlank = /^\s*$/.test(line);
    // An indented code block starts with 4+ spaces after a blank line and
    // is not a continuation of a list (we do not track list state, so we
    // skip any line that starts with 4+ spaces preceded by a blank).
    if (!isBlank && blankBefore && /^ {4}/.test(line)) {
      blankBefore = false;
      continue;
    }
    blankBefore = isBlank;
    if (isBlank) continue;
    const prose = line.replace(/(`+)[^`]*?\1/g, "");
    const def = prose.match(DEFINITION);
    if (def) yield [i + 1, def[1]];
    for (const m of prose.matchAll(INLINE)) yield [i + 1, m[1]];
  }
}

function isLocal(target) {
  return !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#");
}

function resolve(file, target) {
  let path = target.replace(/^<|>$/g, "").replace(/[#?].*$/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path; the existence check reports it.
  }
  return path.startsWith("/") ? join(ROOT, path) : join(ROOT, dirname(file), path);
}

const files = markdownFiles();
let count = 0;
let broken = 0;
for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const [line, target] of links(text)) {
    if (!isLocal(target)) continue;
    count++;
    if (!existsSync(resolve(file, target))) {
      broken++;
      console.log(`FAIL  ${file}:${line}: ${target}`);
    }
  }
}

console.log(`links: ${count} relative links checked in ${files.length} files, ${broken} broken`);
process.exit(broken === 0 ? 0 : 1);
