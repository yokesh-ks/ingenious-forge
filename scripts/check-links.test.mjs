// Tests for the link parser in check-links.mjs. Run: node --test scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { links } from "./check-links.mjs";

const found = (text) => [...links(text)];

test("every line of an indented code block is skipped", () => {
  const text = "Intro\n\n    first [a](missing-one.md)\n    second [b](missing-two.md)\n";
  assert.deepEqual(found(text), []);
});

test("a blank line inside an indented code block keeps it a code block", () => {
  const text = "Intro\n\n    one [a](a.md)\n\n    two [b](b.md)\n";
  assert.deepEqual(found(text), []);
});

test("prose after an indented code block is checked again", () => {
  const text = "Intro\n\n    code [a](a.md)\n\nBack to [prose](real.md).\n";
  assert.deepEqual(found(text), [[5, "real.md"]]);
});

test("an indented line that continues a paragraph is prose", () => {
  const text = "A paragraph\n    still [it](para.md)\n";
  assert.deepEqual(found(text), [[2, "para.md"]]);
});

test("fenced code and code spans are skipped", () => {
  const text = "```\n[a](x.md)\n```\nSee `[b](y.md)` and [c](z.md).\n";
  assert.deepEqual(found(text), [[4, "z.md"]]);
});

test("reference definitions are links", () => {
  assert.deepEqual(found("[ref]: docs/a.md\n"), [[1, "docs/a.md"]]);
});
