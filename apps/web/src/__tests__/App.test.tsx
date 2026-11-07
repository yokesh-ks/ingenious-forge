import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket } from "@/test/fake-socket";
import App from "../App";

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("shows the empty placeholder at / with the sidebar's project list", async () => {
    fakeFetch({ "GET /api/projects": [{ id: "p1", name: "forge", path: "/f" }] });
    render(<App />);
    expect(await screen.findByText(/select a project or open a folder/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "forge" })).toBeInTheDocument();
  });

  it("shows a project's session breadcrumb at /projects/:id/sessions/:sid", async () => {
    window.history.replaceState(null, "", "/projects/p1/sessions/s1");
    fakeFetch({
      "GET /api/projects": [],
      "GET /api/projects/p1": { id: "p1", name: "forge", path: "/f", last_opened_at: 1 },
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
    render(<App />);
    expect(await screen.findByText("forge")).toBeInTheDocument();
    expect(await screen.findByText("Fix it")).toBeInTheDocument();
  });

  it("shows not found for other paths", async () => {
    window.history.replaceState(null, "", "/nowhere");
    fakeFetch({ "GET /api/projects": [] });
    render(<App />);
    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
  });

  it.each([
    ["/artifacts", "Artifacts"],
    ["/scheduled", "Scheduled"],
    ["/plugins", "Plugins"],
    ["/sites", "Sites"],
    ["/code-review", "Code Review"],
  ])("shows a coming soon page without the project sidebar at %s", async (path, title) => {
    window.history.replaceState(null, "", path);
    fakeFetch({ "GET /api/projects": [] });
    render(<App />);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Work" })).not.toBeInTheDocument();
  });

  it("shows the project sidebar in the Work section", async () => {
    fakeFetch({ "GET /api/projects": [] });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute("href", "/");
  });

  it("links to Settings from the rail and shows it at /settings", async () => {
    fakeFetch({ "GET /api/projects": [], "GET /api/settings/providers": [] });
    render(<App />);
    const link = await screen.findByRole("link", { name: /settings/i });
    expect(link).toHaveAttribute("href", "/settings");
    window.history.replaceState(null, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
  });
});
