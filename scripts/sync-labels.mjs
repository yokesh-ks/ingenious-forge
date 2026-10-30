#!/usr/bin/env node
/**
 * sync-labels.mjs
 *
 * Makes the repository's GitHub labels match .github/labels.json, using the
 * gh CLI. Each entry in the file follows the schema:
 *
 *   { "name": "string", "color": "rrggbb", "description": "string" }
 *
 * Usage:
 *   node scripts/sync-labels.mjs                       # dry run: print the plan
 *   node scripts/sync-labels.mjs --apply               # create and update labels
 *   node scripts/sync-labels.mjs --prune               # dry run, also list labels to delete
 *   node scripts/sync-labels.mjs --apply --prune --yes # also delete labels not in the file
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABELS_PATH = join(ROOT, ".github", "labels.json");
const FLAGS = new Set(["--apply", "--prune", "--yes"]);

function parseArgs(argv) {
  for (const arg of argv) {
    if (!FLAGS.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    apply: argv.includes("--apply"),
    prune: argv.includes("--prune"),
    yes: argv.includes("--yes"),
  };
}

function readLabels() {
  if (!existsSync(LABELS_PATH)) {
    throw new Error(`Label file not found: ${LABELS_PATH}`);
  }
  let labels;
  try {
    labels = JSON.parse(readFileSync(LABELS_PATH, "utf8"));
  } catch (err) {
    throw new Error(`Failed to parse ${LABELS_PATH}: ${err.message}`);
  }
  if (!Array.isArray(labels)) {
    throw new Error(`Expected ${LABELS_PATH} to contain a JSON array.`);
  }
  return labels;
}

function validateLabels(labels) {
  const errors = [];
  const seen = new Set();
  labels.forEach((label, index) => {
    if (!label || typeof label !== "object") {
      errors.push(`entry ${index} is not an object`);
      return;
    }
    const { name, color, description } = label;
    if (typeof name !== "string" || name.length === 0) {
      errors.push(`entry ${index}.name must be a non-empty string`);
    } else if (seen.has(name.toLowerCase())) {
      errors.push(`entry ${index}.name "${name}" is a duplicate`);
    } else {
      seen.add(name.toLowerCase());
    }
    if (typeof color !== "string" || !/^[0-9a-f]{6}$/.test(color)) {
      errors.push(`entry ${index}.color must be six lowercase hex digits`);
    }
    // GitHub rejects label descriptions longer than 100 characters.
    if (typeof description !== "string" || description.length === 0) {
      errors.push(`entry ${index}.description must be a non-empty string`);
    } else if (description.length > 100) {
      errors.push(`entry ${index}.description is over 100 characters`);
    }
  });
  return errors;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function readRemoteLabels() {
  const out = gh([
    "label",
    "list",
    "--limit",
    "1000",
    "--json",
    "name,color,description",
  ]);
  return JSON.parse(out);
}

function plan(wanted, remote) {
  const byName = new Map(remote.map((l) => [l.name.toLowerCase(), l]));
  const wantedNames = new Set(wanted.map((l) => l.name.toLowerCase()));
  const create = [];
  const update = [];
  for (const label of wanted) {
    const current = byName.get(label.name.toLowerCase());
    if (!current) {
      create.push(label);
    } else if (
      // A casing-only difference counts: the file sets the exact name.
      current.name !== label.name ||
      current.color.toLowerCase() !== label.color ||
      (current.description ?? "") !== label.description
    ) {
      update.push({ ...label, from: current.name });
    }
  }
  const extra = remote.filter((l) => !wantedNames.has(l.name.toLowerCase()));
  return { create, update, extra };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const labels = readLabels();
  const errors = validateLabels(labels);
  if (errors.length > 0) {
    console.error(`Invalid ${LABELS_PATH}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const { create, update, extra } = plan(labels, readRemoteLabels());
  const mode = opts.apply ? "apply" : "dry run";

  for (const l of create) console.log(`create  ${l.name}`);
  for (const l of update) {
    const rename = l.from !== l.name ? ` (rename from "${l.from}")` : "";
    console.log(`update  ${l.name}${rename}`);
  }
  if (opts.prune) {
    for (const l of extra) console.log(`delete  ${l.name}`);
  } else if (extra.length > 0) {
    console.log(
      `(${extra.length} label(s) not in the file; run with --prune to list them)`
    );
  }

  const deletes = opts.prune ? extra : [];
  if (create.length + update.length + deletes.length === 0) {
    console.log("No changes: labels match the file.");
    return;
  }
  if (!opts.apply) {
    console.log(`\nDry run: nothing changed. Re-run with --apply to write.`);
    return;
  }

  for (const l of create) {
    gh([
      "label",
      "create",
      l.name,
      "--color",
      l.color,
      "--description",
      l.description,
    ]);
  }
  // Edit by the current name so a casing change renames the label.
  for (const l of update) {
    gh([
      "label",
      "edit",
      l.from,
      "--name",
      l.name,
      "--color",
      l.color,
      "--description",
      l.description,
    ]);
  }
  if (deletes.length > 0) {
    if (!opts.yes) {
      console.error(
        `\nNot deleting ${deletes.length} label(s): add --yes to confirm.`
      );
      process.exit(1);
    }
    for (const l of deletes) {
      gh(["label", "delete", l.name, "--yes"]);
    }
  }
  console.log(
    `\nDone (${mode}): ${create.length} created, ${update.length} updated, ` +
      `${opts.yes ? deletes.length : 0} deleted.`
  );
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
