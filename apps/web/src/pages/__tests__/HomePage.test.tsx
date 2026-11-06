import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import HomePage from "../HomePage";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const now = Date.now();
const projects = [
  { id: "p1", name: "forge", path: "/code/forge", last_opened_at: now - 3 * 3_600_000 },
  { id: "p2", name: "site", path: "/code/site", last_opened_at: now - 86_400_000 },
];

describe("HomePage", () => {
  it("shows a loading state, then recent projects with when they were opened", async () => {
    fakeFetch({ "GET /api/projects": projects });
    render(<HomePage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    const forge = await screen.findByRole("link", { name: /forge/ });
    expect(forge).toHaveTextContent("3 hours ago");
    expect(forge).toHaveTextContent("/code/forge");
    expect(screen.getByRole("link", { name: /site/ })).toHaveTextContent("yesterday");
  });

  it("explains what to do when there are no projects yet", async () => {
    fakeFetch({ "GET /api/projects": [] });
    render(<HomePage />);
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it("shows an error when projects cannot load", async () => {
    fakeFetch({ "GET /api/projects": () => ({ status: 500, body: { error: "db down" } }) });
    render(<HomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("db down");
  });

  it("opening a recent project navigates to it", async () => {
    fakeFetch({ "GET /api/projects": projects });
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("link", { name: /forge/ }));
    expect(window.location.pathname).toBe("/projects/p1");
  });

  it("opens a folder from the picker and navigates to the new project", async () => {
    fakeFetch({
      "GET /api/projects": [],
      "GET /api/fs/dirs": {
        path: "/home/me",
        parent: "/home",
        is_git_repo: false,
        entries: [{ name: "app", path: "/home/me/app", is_git_repo: true }],
      },
      "POST /api/projects": { id: "p9", name: "app", path: "/home/me/app", last_opened_at: now },
    });
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("button", { name: /open folder/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Open app" }));
    await vi.waitFor(() => expect(window.location.pathname).toBe("/projects/p9"));
  });

  it("shows why a folder could not be opened", async () => {
    fakeFetch({
      "GET /api/projects": [],
      "GET /api/fs/dirs": {
        path: "/home/me",
        parent: "/home",
        is_git_repo: false,
        entries: [{ name: "app", path: "/home/me/app", is_git_repo: true }],
      },
      "POST /api/projects": () => ({ status: 400, body: { error: "that folder does not exist" } }),
    });
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("button", { name: /open folder/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Open app" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("that folder does not exist");
    expect(window.location.pathname).toBe("/");
  });
});
