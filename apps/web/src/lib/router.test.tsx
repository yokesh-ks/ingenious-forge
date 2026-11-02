import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Link, matchPath, navigate, usePath } from "./router";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("matchPath", () => {
  it("extracts named parameters", () => {
    expect(matchPath("/projects/:id", "/projects/abc")).toEqual({ id: "abc" });
    expect(matchPath("/projects/:id", "/projects/a%20b")).toEqual({ id: "a b" });
  });

  it("returns null when the path does not match", () => {
    expect(matchPath("/projects/:id", "/projects")).toBeNull();
    expect(matchPath("/projects/:id", "/projects/a/b")).toBeNull();
    expect(matchPath("/", "/x")).toBeNull();
    expect(matchPath("/", "/")).toEqual({});
  });
});

describe("usePath and navigate", () => {
  it("follows navigation and the back button", () => {
    const { result } = renderHook(() => usePath());
    expect(result.current).toBe("/");
    act(() => navigate("/projects/p1"));
    expect(result.current).toBe("/projects/p1");
    expect(window.location.pathname).toBe("/projects/p1");
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current).toBe("/");
  });

  it("Link navigates without a page load", async () => {
    render(<Link to="/projects/p2">Open</Link>);
    await userEvent.click(screen.getByRole("link", { name: "Open" }));
    expect(window.location.pathname).toBe("/projects/p2");
  });
});
