import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppRail from "../AppRail";

function railLinks(path: string) {
  render(<AppRail path={path} />);
  return within(screen.getByRole("navigation", { name: "Sections" })).getAllByRole("link");
}

describe("AppRail", () => {
  it("lists the sections in order with their destinations", () => {
    const links = railLinks("/");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Work", "/"],
      ["Artifacts", "/artifacts"],
      ["Scheduled", "/scheduled"],
      ["Plugins", "/plugins"],
      ["Sites", "/sites"],
      ["Code Review", "/code-review"],
      ["Settings", "/settings"],
    ]);
  });

  it.each([
    ["/", "Work"],
    ["/projects/p1", "Work"],
    ["/projects/p1/sessions/s1", "Work"],
    ["/scheduled", "Scheduled"],
    ["/code-review", "Code Review"],
    ["/settings", "Settings"],
  ])("marks only the active section at %s", (path, label) => {
    const current = railLinks(path).filter((link) => link.hasAttribute("aria-current"));
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it.each(["/nowhere", "/projects"])("marks no section at %s, which has no page", (path) => {
    expect(railLinks(path).some((link) => link.hasAttribute("aria-current"))).toBe(false);
  });
});
