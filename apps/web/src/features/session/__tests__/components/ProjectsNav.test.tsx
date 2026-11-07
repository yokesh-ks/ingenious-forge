import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("has no Open folder row, only the header icon", async () => {
    fakeFetch({ "GET /api/projects": [] });
    renderNav();
    expect(
      await screen.findByRole("button", { name: "Select Project Directory" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/open folder/i)).not.toBeInTheDocument();
  });

  it("opens the folder chosen in the dialog and navigates to the new project", async () => {
    fakeFetch({
      "GET /api/projects": [],
      "POST /api/fs/pick-folder": { path: "/home/forge" },
      "POST /api/projects": { id: "p9", name: "forge", path: "/home/forge", last_opened_at: 2 },
    });
    renderNav();
    await userEvent.click(await screen.findByRole("button", { name: "Select Project Directory" }));
    expect(await screen.findByRole("button", { name: "forge" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/p9");
  });

  it("stays put when the dialog is closed without a choice", async () => {
    const fetch = fakeFetch({
      "GET /api/projects": [],
      "POST /api/fs/pick-folder": { path: null },
    });
    renderNav();
    const icon = await screen.findByRole("button", { name: "Select Project Directory" });
    await userEvent.click(icon);
    await waitFor(() => expect(icon).toBeEnabled());
    expect(window.location.pathname).toBe("/");
    expect(fetch.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "POST"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows why a chosen folder cannot be opened", async () => {
    fakeFetch({
      "GET /api/projects": [],
      "POST /api/fs/pick-folder": { path: "/home/plain" },
      "POST /api/projects": () => ({
        status: 400,
        body: { error: "that folder is not a git repository" },
      }),
    });
    renderNav();
    await userEvent.click(await screen.findByRole("button", { name: "Select Project Directory" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not a git repository/i);
    expect(window.location.pathname).toBe("/");
  });

  describe("project row actions", () => {
    const forge = { id: "p1", name: "forge", path: "/f", last_opened_at: 1 };

    async function openMenu() {
      await userEvent.click(await screen.findByRole("button", { name: "Actions for forge" }));
    }

    it("starts a new session from the plus icon", async () => {
      fakeFetch({
        "GET /api/projects": [forge],
        "GET /api/projects/p1/sessions": [],
        "POST /api/projects/p1/sessions": { id: "s9", project_id: "p1", title: "New session" },
      });
      renderNav();
      await userEvent.click(await screen.findByRole("button", { name: "New session in forge" }));
      await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s9"));
    });

    it("shows why a new session could not start", async () => {
      fakeFetch({
        "GET /api/projects": [forge],
        "POST /api/projects/p1/sessions": () => ({
          status: 400,
          body: { error: "no provider is configured" },
        }),
      });
      renderNav();
      await userEvent.click(await screen.findByRole("button", { name: "New session in forge" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/no provider/i);
    });

    it("renames a project", async () => {
      const fetch = fakeFetch({
        "GET /api/projects": [forge],
        "PATCH /api/projects/p1": { ...forge, name: "My app" },
      });
      renderNav();
      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: /rename/i }));
      const input = await screen.findByRole("textbox", { name: "Project name" });
      await userEvent.clear(input);
      await userEvent.type(input, "My app");
      await userEvent.click(screen.getByRole("button", { name: "Rename" }));
      expect(await screen.findByRole("button", { name: "My app" })).toBeInTheDocument();
      const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patch?.[1]?.body).toBe(JSON.stringify({ name: "My app" }));
    });

    it("asks the server to show the folder", async () => {
      const fetch = fakeFetch({
        "GET /api/projects": [forge],
        "POST /api/projects/p1/open-in": forge,
      });
      renderNav();
      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: /show in/i }));
      await waitFor(() =>
        expect(fetch.mock.calls.map(([url]) => String(url))).toContain("/api/projects/p1/open-in"),
      );
    });

    it("deletes only after confirming, and leaves the deleted project's page", async () => {
      window.history.replaceState(null, "", "/projects/p1");
      const fetch = fakeFetch({
        "GET /api/projects": [forge],
        "GET /api/projects/p1/sessions": [],
        "DELETE /api/projects/p1": forge,
      });
      renderNav();
      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: /delete workspace/i }));
      const confirm = await screen.findByRole("alertdialog");
      expect(confirm).toHaveTextContent(/stay on disk/i);
      expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

      await userEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

      await waitFor(() => expect(window.location.pathname).toBe("/"));
      expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
      expect(screen.queryByRole("button", { name: "forge" })).not.toBeInTheDocument();
    });

    it("keeps the project and shows the refusal when deleting fails", async () => {
      fakeFetch({
        "GET /api/projects": [forge],
        "DELETE /api/projects/p1": () => ({
          status: 409,
          body: { error: "a session in this workspace is still running; stop it first" },
        }),
      });
      renderNav();
      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: /delete workspace/i }));
      await screen.findByRole("alertdialog");
      await userEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/still running/i);
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("session row actions", () => {
    const forge = { id: "p1", name: "forge", path: "/f", last_opened_at: 1 };
    const session = (over = {}) => ({
      id: "s1",
      project_id: "p1",
      title: "Fix it",
      created_at: 1,
      updated_at: 1,
      running: false,
      pinned: false,
      archived: false,
      ...over,
    });

    function routes(sessions: unknown[], more = {}) {
      window.history.replaceState(null, "", "/projects/p1/sessions/s1");
      return fakeFetch({
        "GET /api/projects": [forge],
        "GET /api/projects/p1/sessions": sessions,
        ...more,
      });
    }

    async function openMenu() {
      await userEvent.click(await screen.findByRole("button", { name: "Actions for Fix it" }));
    }

    const bodies = (fetch: ReturnType<typeof fakeFetch>, method: string) =>
      fetch.mock.calls.filter(([, init]) => init?.method === method).map(([, init]) => init?.body);

    it("pins and unpins from the row icon", async () => {
      const fetch = routes([session()], { "PATCH /api/sessions/s1": session({ pinned: true }) });
      renderNav();
      await userEvent.click(await screen.findByRole("button", { name: "Pin Fix it" }));
      await waitFor(() =>
        expect(bodies(fetch, "PATCH")).toEqual([JSON.stringify({ pinned: true })]),
      );
    });

    it("offers Unpin for a pinned session", async () => {
      routes([session({ pinned: true })]);
      renderNav();
      await openMenu();
      expect(await screen.findByRole("menuitem", { name: /unpin session/i })).toBeInTheDocument();
    });

    it("renames a session", async () => {
      const fetch = routes([session()], { "PATCH /api/sessions/s1": session({ title: "Better" }) });
      renderNav();
      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: /rename/i }));
      const input = await screen.findByRole("textbox", { name: "Session title" });
      await userEvent.clear(input);
      await userEvent.type(input, "Better");
      await userEvent.click(screen.getByRole("button", { name: "Rename" }));
      await waitFor(() =>
        expect(bodies(fetch, "PATCH")).toEqual([JSON.stringify({ title: "Better" })]),
      );
    });

    it("forks and opens the fork", async () => {
      routes([session()], {
        "POST /api/sessions/s1/fork": session({ id: "s2", title: "Fix it (fork)" }),
      });
      renderNav();
      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: /fork session/i }));
      await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s2"));
    });

    it("copies the session id", async () => {
      routes([session()]);
      const user = userEvent.setup();
      renderNav();
      await user.click(await screen.findByRole("button", { name: "Actions for Fix it" }));
      await user.click(await screen.findByRole("menuitem", { name: /copy session id/i }));
      await expect(navigator.clipboard.readText()).resolves.toBe("s1");
    });

    it("opens the project folder from the Open in menu", async () => {
      const fetch = routes([session()], { "POST /api/projects/p1/open-in": forge });
      renderNav();
      await openMenu();
      await userEvent.click(await screen.findByRole("menuitem", { name: /open in/i }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "VS Code" }));
      await waitFor(() =>
        expect(bodies(fetch, "POST")).toEqual([JSON.stringify({ app: "vs_code" })]),
      );
    });

    it("archiving the open session moves to the next one", async () => {
      const fetch = routes([session(), session({ id: "s2", title: "Other" })], {
        "PATCH /api/sessions/s1": session({ archived: true }),
      });
      renderNav();
      await userEvent.click(await screen.findByRole("button", { name: "Archive Fix it" }));
      await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s2"));
      expect(bodies(fetch, "PATCH")).toEqual([JSON.stringify({ archived: true })]);
    });

    it("shows why a session could not be archived, and stays on it", async () => {
      routes([session()], {
        "PATCH /api/sessions/s1": () => ({ status: 409, body: { error: "still running" } }),
      });
      renderNav();
      await userEvent.click(await screen.findByRole("button", { name: "Archive Fix it" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/still running/i);
      expect(window.location.pathname).toBe("/projects/p1/sessions/s1");
    });

    it("runs the shortcuts on the open session only", async () => {
      const fetch = routes([session(), session({ id: "s2", title: "Other" })], {
        "POST /api/sessions/s1/fork": session({ id: "s3" }),
      });
      renderNav();
      await screen.findByRole("link", { name: /fix it/i });
      fireEvent.keyDown(window, { code: "KeyF", metaKey: true, shiftKey: true });
      await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s3"));
      expect(bodies(fetch, "POST")).toHaveLength(1);
    });
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
    expect(screen.getByRole("link", { name: /fix it/i })).toHaveTextContent(/^Fix it$/);
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
