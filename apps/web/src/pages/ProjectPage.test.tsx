import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket } from "@/test/fake-socket";
import ProjectPage from "./ProjectPage";

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
  window.history.replaceState(null, "", "/projects/p1");
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const project = { id: "p1", name: "forge", path: "/code/forge", last_opened_at: 1 };
const session = (id: string, title: string) => ({
  id,
  project_id: "p1",
  title,
  created_at: 1,
  updated_at: Date.now(),
  running: false,
});

describe("ProjectPage", () => {
  it("opens the most recent session when none is chosen", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s2", "Newest"), session("s1", "Older")],
    });
    render(<ProjectPage projectId="p1" sessionId={null} />);
    expect(await screen.findByRole("heading", { name: "forge" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s2"));
  });

  it("creates a first session for a project without any", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [],
      "POST /api/projects/p1/sessions": session("s9", "New session"),
    });
    render(<ProjectPage projectId="p1" sessionId={null} />);
    await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s9"));
  });

  it("creates only one first session even when effects run twice", async () => {
    const fetch = fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [],
      "POST /api/projects/p1/sessions": session("s9", "New session"),
    });
    render(
      <StrictMode>
        <ProjectPage projectId="p1" sessionId={null} />
      </StrictMode>,
    );
    await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s9"));
    const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
  });

  it("shows the sidebar and the chosen session's workspace", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s2", "Newest"), session("s1", "Older")],
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    expect(await screen.findByRole("link", { name: /older/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByPlaceholderText(/ask forge/i)).toBeInTheDocument();
    expect(screen.getByText("/code/forge")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all projects/i })).toHaveAttribute("href", "/");
  });

  it("switching sessions connects the workspace to the other session", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s2", "Newest"), session("s1", "Older")],
    });
    const { rerender } = render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("link", { name: /newest/i }));
    expect(window.location.pathname).toBe("/projects/p1/sessions/s2");
    rerender(<ProjectPage projectId="p1" sessionId="s2" />);
    const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
    act(() => socket.open());
    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "hi{Enter}");
    expect(JSON.parse(socket.sent[0]).session_id).toBe("s2");
  });

  it("New session creates a session, opens it and lists it at once", async () => {
    let list = [session("s1", "Older")];
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": () => ({ body: list }),
      "POST /api/projects/p1/sessions": () => {
        list = [session("s3", "New session"), ...list];
        return { body: list[0] };
      },
    });
    const { rerender } = render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /new session/i }));

    await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s3"));
    expect(await screen.findByRole("link", { name: /new session/i })).toBeInTheDocument();
    rerender(<ProjectPage projectId="p1" sessionId="s3" />);
    expect(screen.getByPlaceholderText(/ask forge/i)).toHaveFocus();
  });

  it("shows why a new session could not be created", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
      "POST /api/projects/p1/sessions": () => ({ status: 500, body: { error: "disk full" } }),
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /new session/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(window.location.pathname).toBe("/projects/p1");
  });

  it("shows an error for an unknown project", async () => {
    fakeFetch({
      "GET /api/projects/zz": () => ({ status: 404, body: { error: "project not found" } }),
      "GET /api/projects/zz/sessions": () => ({
        status: 404,
        body: { error: "project not found" },
      }),
    });
    render(<ProjectPage projectId="zz" sessionId={null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("project not found");
  });
});
