import { describe, expect, it } from "vitest";
import { columnName, parseDelimited } from "../../model/delimited";

describe("parseDelimited", () => {
  it("keeps every field as text", () => {
    expect(parseDelimited("a,1\nb,002\n", ",").rows).toEqual([
      ["a", "1"],
      ["b", "002"],
    ]);
  });

  it("honours quotes, escapes and newlines inside them", () => {
    expect(parseDelimited('"a,b","c""d","e\nf"', ",").rows).toEqual([["a,b", 'c"d', "e\nf"]]);
  });

  it("reads tabs, CRLF and a byte-order mark", () => {
    const { rows, columns } = parseDelimited("﻿a\tb\r\nc", "\t");
    expect(rows).toEqual([["a", "b"], ["c"]]);
    expect(columns).toBe(2);
  });

  it("stops at the cell limit and says so", () => {
    expect(parseDelimited("a,".repeat(300_000), ",").truncated).toBe(true);
  });
});

describe("columnName", () => {
  it.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [701, "ZZ"],
  ])("names column %i %s", (index, name) => {
    expect(columnName(index)).toBe(name);
  });
});
