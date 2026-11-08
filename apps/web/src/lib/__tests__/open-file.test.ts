import { describe, expect, it } from "vitest";
import { parseFileLink, toProjectPath } from "../open-file";

describe("parseFileLink", () => {
  it("takes a relative link as a project path", () => {
    expect(parseFileLink("src/main.rs")).toEqual({ path: "src/main.rs" });
  });

  it("starts relative links from the base folder and works out dots", () => {
    expect(parseFileLink("../LICENSE", "docs/guide")).toEqual({ path: "docs/LICENSE" });
    expect(parseFileLink("./a.md", "docs")).toEqual({ path: "docs/a.md" });
  });

  it("reads a line from a fragment or a suffix", () => {
    expect(parseFileLink("a.ts#L12")).toEqual({ path: "a.ts", line: 12 });
    expect(parseFileLink("a.ts:7")).toEqual({ path: "a.ts", line: 7 });
    expect(parseFileLink("a.ts:7:3")).toEqual({ path: "a.ts", line: 7 });
  });

  it("drops a query and other fragments and decodes the path", () => {
    expect(parseFileLink("my%20file.md?x=1#title")).toEqual({ path: "my file.md" });
  });

  it("keeps absolute paths", () => {
    expect(parseFileLink("/home/me/p/a.ts")).toEqual({ path: "/home/me/p/a.ts" });
  });

  it("is not a file link for a scheme, a bare fragment or nothing", () => {
    for (const href of ["mailto:a@b.c", "https://x.y", "#top", "", "/"]) {
      expect(parseFileLink(href)).toBeNull();
    }
  });

  it("keeps a climb past the top for the server to refuse", () => {
    expect(parseFileLink("../../etc/passwd")).toEqual({ path: "../../etc/passwd" });
  });
});

describe("toProjectPath", () => {
  it("strips the project's folder", () => {
    expect(toProjectPath("/home/me/p/src/a.ts", "/home/me/p")).toBe("src/a.ts");
    expect(toProjectPath("/home/me/p/src/a.ts", "/home/me/p/")).toBe("src/a.ts");
  });

  it("leaves relative paths and paths elsewhere alone", () => {
    expect(toProjectPath("./src/a.ts", "/home/me/p")).toBe("src/a.ts");
    expect(toProjectPath("/home/me/other/a.ts", "/home/me/p")).toBe("/home/me/other/a.ts");
    expect(toProjectPath("/home/me/project2/a.ts", "/home/me/project")).toBe(
      "/home/me/project2/a.ts",
    );
  });
});
