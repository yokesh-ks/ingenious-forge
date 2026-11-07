import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppRail from "../AppRail";

function railLinks(path: string) {
  cleanup();
  render(<AppRail path={path} />);
  return within(screen.getByRole("navigation", { name: "Sections" })).getAllByRole("link");
}

describe("AppRail", () => {
  it("lists only the real sections in order with their destinations", () => {
    const links = railLinks("/");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Work", "/"],
      ["Settings", "/settings"],
    ]);
  });

  it("hides the coming-soon sections from the rail", () => {
    // Coming-soon sections never appear as rail links, whatever the active path.
    for (const path of ["/", "/scheduled", "/plugins", "/code-review"]) {
      const links = railLinks(path);
      expect(links.map((link) => link.textContent)).toEqual(["Work", "Settings"]);
    }
  });

  it.each([
    ["/", "Work"],
    ["/projects/p1", "Work"],
    ["/projects/p1/sessions/s1", "Work"],
    ["/settings", "Settings"],
  ])("marks only the active section at %s", (path, label) => {
    const current = railLinks(path).filter((link) => link.hasAttribute("aria-current"));
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it.each(["/nowhere", "/projects"])("marks no section at %s, which has no page", (path) => {
    expect(railLinks(path).some((link) => link.hasAttribute("aria-current"))).toBe(false);
  });
});
