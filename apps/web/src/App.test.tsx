import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket } from "@/test/fake-socket";
import App from "./App";

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("shows the home page at /", async () => {
    fakeFetch({ "GET /api/projects": [] });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /recent projects/i })).toBeInTheDocument();
  });

  it("shows a project's session at /projects/:id/sessions/:sid", async () => {
    window.history.replaceState(null, "", "/projects/p1/sessions/s1");
    fakeFetch({
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
    expect(await screen.findByRole("heading", { name: "forge" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /fix it/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows not found for other paths", () => {
    window.history.replaceState(null, "", "/nowhere");
    render(<App />);
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });
});
