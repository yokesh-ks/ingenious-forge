import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket } from "@/test/fake-socket";
import ProjectPage from "./ProjectPage";

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

const project = { id: "p1", name: "forge", path: "/code/forge", last_opened_at: 1 };
const session = { id: "s9", project_id: "p1", title: "New session", created_at: 1, updated_at: 1 };

describe("ProjectPage", () => {
  it("shows the project and opens a session in it", async () => {
    fakeFetch({ "GET /api/projects/p1": project, "POST /api/projects/p1/sessions": session });
    render(<ProjectPage projectId="p1" />);
    expect(await screen.findByRole("heading", { name: "forge" })).toBeInTheDocument();
    expect(screen.getByText("/code/forge")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/ask forge/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all projects/i })).toHaveAttribute("href", "/");
  });

  it("shows an error for an unknown project", async () => {
    fakeFetch({
      "GET /api/projects/zz": () => ({ status: 404, body: { error: "project not found" } }),
    });
    render(<ProjectPage projectId="zz" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("project not found");
  });
});
