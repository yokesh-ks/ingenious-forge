import { describe, expect, it } from "vitest";
import { buildTree, filterFiles } from "../file-tree";

describe("buildTree", () => {
  it("nests files under their folders, folders first, both sorted", () => {
    const tree = buildTree(["src/b.ts", "README.md", "src/a/x.ts", "a.txt"]);
    expect(tree).toEqual([
      {
        name: "src",
        path: "src",
        children: [
          { name: "a", path: "src/a", children: [{ name: "x.ts", path: "src/a/x.ts" }] },
          { name: "b.ts", path: "src/b.ts" },
        ],
      },
      { name: "README.md", path: "README.md" },
      { name: "a.txt", path: "a.txt" },
    ]);
  });

  it("is empty for no files", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("filterFiles", () => {
  const files = ["src/App.tsx", "src/app.test.tsx", "README.md"];

  it("keeps every file for a blank query", () => {
    expect(filterFiles(files, "  ")).toEqual(files);
  });

  it("matches anywhere in the path, ignoring case", () => {
    expect(filterFiles(files, "APP")).toEqual(["src/App.tsx", "src/app.test.tsx"]);
    expect(filterFiles(files, "src/app.test")).toEqual(["src/app.test.tsx"]);
  });

  it("matches nothing for an unknown name", () => {
    expect(filterFiles(files, "zzz")).toEqual([]);
  });
});
