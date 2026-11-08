import { describe, expect, it } from "vitest";
import {
  clampNavigator,
  failureLine,
  failureRecourse,
  fileFailure,
  isUnviewable,
  navigatorLayout,
  viewersFor,
} from "../../model/file-preview";

const ids = (path: string) => viewersFor(path).map((v) => v.id);

describe("viewersFor", () => {
  it("puts the best viewer first and always offers plain text", () => {
    expect(ids("README.md")).toEqual(["markdown", "code", "text"]);
    expect(ids("src/main.rs")).toEqual(["code", "text"]);
    expect(ids("LICENSE")).toEqual(["text"]);
    expect(ids(".gitignore")).toEqual(["text"]);
  });

  it("offers wrapping for code and plain text but not Markdown", () => {
    expect(viewersFor("a.md").map((v) => v.wrap)).toEqual([false, true, true]);
  });
});

describe("isUnviewable", () => {
  it("knows binary suffixes, ignoring case", () => {
    expect(isUnviewable("a/b.ZIP")).toBe(true);
    expect(isUnviewable("forge.db")).toBe(true);
    expect(isUnviewable("a.ts")).toBe(false);
    expect(isUnviewable("LICENSE")).toBe(false);
  });
});

describe("failures", () => {
  it("names the reason and the next step for each status", () => {
    const cases: [number, RegExp, string][] = [
      [404, /File not found/, "none"],
      [413, /2 MB/, "open"],
      [415, /not available/, "open"],
      [422, /Not a regular file/, "none"],
      [500, /Read failed: boom/, "retry"],
      [0, /Read failed: boom/, "retry"],
    ];
    for (const [status, line, recourse] of cases) {
      const failure = fileFailure(status, "boom");
      expect(failureLine(failure)).toMatch(line);
      expect(failureRecourse(failure)).toBe(recourse);
    }
  });
});

describe("navigatorLayout", () => {
  it("follows the row's width", () => {
    expect(navigatorLayout(600, 1440)).toBe("push");
    expect(navigatorLayout(560, 1440)).toBe("push");
    expect(navigatorLayout(559, 1440)).toBe("overlay");
    expect(navigatorLayout(400, 1440)).toBe("overlay");
    expect(navigatorLayout(399, 1440)).toBe("fill");
  });

  it("fills on a small screen, and counts an unmeasured row as wide", () => {
    expect(navigatorLayout(700, 767)).toBe("fill");
    expect(navigatorLayout(0, 1440)).toBe("push");
  });
});

describe("clampNavigator", () => {
  it("keeps the file readable beside and under the tree", () => {
    expect(clampNavigator(260, 800, "push")).toBe(260);
    expect(clampNavigator(600, 800, "push")).toBe(464);
    expect(clampNavigator(600, 460, "overlay")).toBe(340);
  });

  it("stays at least 180px wide where the row allows it", () => {
    expect(clampNavigator(100, 800, "push")).toBe(180);
    expect(clampNavigator(100, 150, "overlay")).toBe(150);
  });
});
