import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const breadcrumb = await screen.findByRole("navigation", { name: /breadcrumb/i });
    expect(await within(breadcrumb).findByText("forge")).toBeInTheDocument();
    expect(await within(breadcrumb).findByText("Fix it")).toBeInTheDocument();
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

  it("toggles the sidebar with Cmd+B, except while typing in a text field", async () => {
    fakeFetch({ "GET /api/projects": [] });
    const { container } = render(
      <>
        <textarea aria-label="Composer" />
        <App />
      </>,
    );
    await screen.findByRole("heading", { name: "Work" });
    const collapsed = () =>
      container.querySelector('[data-slot="sidebar"][data-state="collapsed"]');

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Composer" }), {
      key: "b",
      metaKey: true,
    });
    expect(collapsed()).toBeNull();

    fireEvent.keyDown(document.body, { key: "b", metaKey: true });
    await waitFor(() => expect(collapsed()).not.toBeNull());
  });

  it("links to Settings from the rail and shows it at /settings", async () => {
    fakeFetch({ "GET /api/projects": [], "GET /api/settings/providers": [] });
    render(<App />);
    const link = await screen.findByRole("link", { name: /settings/i });
    expect(link).toHaveAttribute("href", "/settings");
    window.history.replaceState(null, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
    // It opens on the first page, in place of /settings in the history.
    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/settings/appearance");
  });

  it("gives Settings its own sidebar, one URL per page", async () => {
    fakeFetch({ "GET /api/projects": [], "GET /api/settings/providers": [] });
    window.history.replaceState(null, "", "/settings/appearance");
    render(<App />);
    const nav = await screen.findByRole("navigation", { name: "Settings" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Appearance", "/settings/appearance"],
      ["Providers", "/settings/providers"],
      ["Session defaults", "/settings/defaults"],
      ["GitHub", "/settings/github"],
    ]);
    expect(within(nav).getByRole("link", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.queryByRole("button", { name: "Select Project Directory" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(nav).getByRole("link", { name: "Providers" }));

    expect(window.location.pathname).toBe("/settings/providers");
    expect(screen.queryByRole("heading", { name: "Providers" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Providers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The rail still shows Settings as the current section.
    expect(document.querySelector('a[href="/settings"]')).toHaveAttribute("aria-current", "page");
  });

  it("does not treat an unknown settings path as a page", async () => {
    fakeFetch({ "GET /api/projects": [] });
    window.history.replaceState(null, "", "/settings/nope");
    render(<App />);
    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
  });
});
