import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Link, matchPath, navigate, usePath, useQueryParam } from "../router";

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

  it("can replace the current history entry", () => {
    const before = window.history.length;
    navigate("/a");
    navigate("/b", { replace: true });
    expect(window.location.pathname).toBe("/b");
    expect(window.history.length).toBe(before + 1);
  });

  it("Link navigates without a page load", async () => {
    render(<Link to="/projects/p2">Open</Link>);
    await userEvent.click(screen.getByRole("link", { name: "Open" }));
    expect(window.location.pathname).toBe("/projects/p2");
  });
});

describe("useQueryParam", () => {
  it("reads and sets one query parameter, keeping the path and others", () => {
    window.history.replaceState(null, "", "/projects/p1?x=1");
    const { result } = renderHook(() => useQueryParam("view"));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]("statistics"));
    expect(result.current[0]).toBe("statistics");
    expect(window.location.pathname).toBe("/projects/p1");
    expect(new URLSearchParams(window.location.search).get("x")).toBe("1");
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
    expect(window.location.search).toBe("?x=1");
  });
});
