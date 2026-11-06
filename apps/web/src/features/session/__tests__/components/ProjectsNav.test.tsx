import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket } from "@/test/fake-socket";
import ProjectsNav from "../../components/ProjectsNav";

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function renderNav() {
  return render(
    <SidebarProvider>
      <ProjectsNav />
    </SidebarProvider>,
  );
}

describe("ProjectsNav", () => {
  it("lists recent projects", async () => {
    fakeFetch({
      "GET /api/projects": [{ id: "p1", name: "forge", path: "/f", last_opened_at: 1 }],
    });
    renderNav();
    expect(await screen.findByRole("button", { name: "forge" })).toBeInTheDocument();
  });

  it("says when there are no projects yet", async () => {
    fakeFetch({ "GET /api/projects": [] });
    renderNav();
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it("opens a folder and navigates to the new project", async () => {
    fakeFetch({
      "GET /api/projects": [],
      "GET /api/fs/dirs": { path: "/home", parent: null, is_git_repo: true, entries: [] },
      "POST /api/projects": { id: "p9", name: "forge", path: "/home/forge", last_opened_at: 2 },
    });
    renderNav();
    await userEvent.click(await screen.findByRole("button", { name: /open folder/i }));
    await userEvent.click(await screen.findByRole("button", { name: /open this folder/i }));
    expect(window.location.pathname).toBe("/projects/p9");
  });

  it("expanding a project navigates to it and lists its sessions", async () => {
    fakeFetch({
      "GET /api/projects": [{ id: "p1", name: "forge", path: "/f", last_opened_at: 1 }],
      "GET /api/projects/p1/sessions": [
        {
          id: "s1",
          project_id: "p1",
          title: "Fix it",
          created_at: 1,
          updated_at: 1,
          running: true,
        },
      ],
    });
    renderNav();
    await userEvent.click(await screen.findByRole("button", { name: "forge" }));
    expect(window.location.pathname).toBe("/projects/p1");
    expect(await screen.findByRole("link", { name: /fix it/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /running/i })).toBeInTheDocument();
  });

  it("highlights the active session and auto-expands its project", async () => {
    window.history.replaceState(null, "", "/projects/p1/sessions/s1");
    fakeFetch({
      "GET /api/projects": [{ id: "p1", name: "forge", path: "/f", last_opened_at: 1 }],
      "GET /api/projects/p1/sessions": [
        {
          id: "s1",
          project_id: "p1",
          title: "Fix it",
          created_at: 1,
          updated_at: 1,
          running: false,
        },
      ],
    });
    renderNav();
    expect(await screen.findByRole("link", { name: /fix it/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("clicking a session connects its socket", async () => {
    window.history.replaceState(null, "", "/projects/p1");
    fakeFetch({
      "GET /api/projects": [{ id: "p1", name: "forge", path: "/f", last_opened_at: 1 }],
      "GET /api/projects/p1/sessions": [
        {
          id: "s1",
          project_id: "p1",
          title: "Fix it",
          created_at: 1,
          updated_at: 1,
          running: false,
        },
      ],
    });
    renderNav();
    await userEvent.click(await screen.findByRole("link", { name: /fix it/i }));
    expect(window.location.pathname).toBe("/projects/p1/sessions/s1");
  });
});
