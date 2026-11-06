import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalMode, SessionModel } from "@/api/types";
import { catalog } from "@/test/catalog";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket, openSocket } from "@/test/fake-socket";
import ProjectPage from "../ProjectPage";

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
const session = (id: string, title: string, model: SessionModel | null = null) => ({
  id,
  project_id: "p1",
  title,
  created_at: 1,
  updated_at: Date.now(),
  running: false,
  model,
  approval_mode: "ask" as ApprovalMode,
});

describe("ProjectPage", () => {
  it("opens the most recent session when none is chosen", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s2", "Newest"), session("s1", "Older")],
    });
    render(<ProjectPage projectId="p1" sessionId={null} />);
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

  it("shows the chosen session's workspace", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s2", "Newest"), session("s1", "Older")],
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    expect(await screen.findByPlaceholderText(/ask forge/i)).toBeInTheDocument();
  });

  it("switching sessions connects the workspace to the other session", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s2", "Newest"), session("s1", "Older")],
    });
    const { rerender } = render(<ProjectPage projectId="p1" sessionId="s1" />);
    await screen.findByPlaceholderText(/ask forge/i);
    rerender(<ProjectPage projectId="p1" sessionId="s2" />);
    const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
    await openSocket(socket);
    await userEvent.type(screen.getByPlaceholderText(/ask forge/i), "hi{Enter}");
    expect(JSON.parse(socket.sent[0]).session_id).toBe("s2");
  });

  it("New session creates a session, opens it and lists it at once", async () => {
    let list = [session("s1", "Older")];
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/models": catalog,
      "GET /api/projects/p1/sessions": () => ({ body: list }),
      "POST /api/projects/p1/sessions": () => {
        list = [session("s3", "New session"), ...list];
        return { body: list[0] };
      },
    });
    const { rerender } = render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /new session/i }));
    await userEvent.click(await screen.findByRole("button", { name: /start session/i }));

    await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s3"));
    rerender(<ProjectPage projectId="p1" sessionId="s3" />);
    expect(screen.getByPlaceholderText(/ask forge/i)).toHaveFocus();
  });

  it("shows why a new session could not be created", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
      "GET /api/models": catalog,
      "POST /api/projects/p1/sessions": () => ({ status: 500, body: { error: "disk full" } }),
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /new session/i }));
    await userEvent.click(await screen.findByRole("button", { name: /start session/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(window.location.pathname).toBe("/projects/p1");
  });

  it("opening an old session shows its messages, tool calls and diffs in order", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
      "GET /api/sessions/s1/events": [
        { seq: 1, type: "user_message", session_id: "s1", text: "fix the typo" },
        { seq: 2, type: "turn_started", session_id: "s1" },
        { seq: 3, type: "output", session_id: "s1", chunk: "Reading it." },
        {
          seq: 4,
          type: "tool_call",
          session_id: "s1",
          call_id: "t1",
          name: "edit_file",
          args: { path: "a.md" },
        },
        {
          seq: 5,
          type: "tool_result",
          session_id: "s1",
          call_id: "t1",
          output: "Edited a.md",
          is_error: false,
        },
        {
          seq: 6,
          type: "file_changed",
          session_id: "s1",
          path: "a.md",
          diff: "@@ -1 +1 @@\n-teh\n+the\n",
          additions: 1,
          deletions: 1,
        },
        { seq: 7, type: "output", session_id: "s1", chunk: "Fixed." },
        { seq: 8, type: "done", session_id: "s1" },
      ],
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    // The page opens one socket for the session list and one for the session.
    for (const socket of [...FakeSocket.instances]) await openSocket(socket);

    const texts = screen.getAllByTestId("message-text").map((el) => el.textContent);
    expect(texts).toEqual(["fix the typo", "Reading it.", "Fixed."]);
    expect(screen.getByRole("article", { name: /edit tool call/i })).toHaveTextContent(
      "Edited a.md",
    );
    expect(screen.getByRole("button", { name: /a\.md/ })).toHaveTextContent("+1−1");
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

  it("New session asks for a model and effort and sends the choice", async () => {
    const fetch = fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/models": catalog,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
      "POST /api/projects/p1/sessions": session("s4", "New session"),
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /new session/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/^model$/i), "claude-sonnet-5-5");
    await userEvent.selectOptions(screen.getByLabelText(/reasoning effort/i), "low");
    await userEvent.click(screen.getByRole("button", { name: /start session/i }));

    await waitFor(() => expect(window.location.pathname).toBe("/projects/p1/sessions/s4"));
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "low" },
    });
  });

  it("cancelling the new-session form creates nothing", async () => {
    const fetch = fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/models": catalog,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /new session/i }));
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /start session/i })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("the header shows each session's own model", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/models": catalog,
      "GET /api/projects/p1/sessions": [
        session("s2", "Second", {
          provider: "anthropic",
          model: "claude-sonnet-5-5",
          effort: "low",
        }),
        session("s1", "First", { provider: "anthropic", model: "claude-opus-5-5", effort: "max" }),
      ],
    });
    const { rerender } = render(<ProjectPage projectId="p1" sessionId="s1" />);
    const header = await screen.findByRole("group", { name: /session settings/i });
    await waitFor(() => expect(header).toHaveTextContent("Claude Opus 5.5"));
    expect(header).toHaveTextContent("Max effort");

    rerender(<ProjectPage projectId="p1" sessionId="s2" />);
    await waitFor(() =>
      expect(screen.getByRole("group", { name: /session settings/i })).toHaveTextContent(
        "Claude Sonnet 5.5",
      ),
    );
    expect(screen.getByRole("group", { name: /session settings/i })).toHaveTextContent(
      "Low effort",
    );
  });

  it("changes the approval mode from the header", async () => {
    let mode: ApprovalMode = "ask";
    const fetch = fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/models": catalog,
      "GET /api/projects/p1/sessions": () => ({
        body: [{ ...session("s1", "Older"), approval_mode: mode }],
      }),
      "PUT /api/sessions/s1/approval-mode": (init: RequestInit | undefined) => {
        mode = JSON.parse(String(init?.body)).mode;
        return { body: { ...session("s1", "Older"), approval_mode: mode } };
      },
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /approval mode: ask/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /auto-edit/i }));

    expect(
      await screen.findByRole("button", { name: /approval mode: auto-edit/i }),
    ).toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true);
  });

  it("shows why the approval mode could not be changed", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
      "PUT /api/sessions/s1/approval-mode": () => ({ status: 500, body: { error: "db locked" } }),
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    await userEvent.click(await screen.findByRole("button", { name: /approval mode: ask/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /full-auto/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("db locked");
  });

  it("the header shows the project's branch and changes", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
      "GET /api/projects/p1/git/status": { branch: "main", detached: false, staged: 1, changed: 0 },
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    const badge = await screen.findByRole("group", { name: /git status/i });
    expect(badge).toHaveTextContent("main");
    expect(badge).toHaveTextContent("1 staged");
  });

  it("the header shows the session's sandbox and writable folders", async () => {
    fakeFetch({
      "GET /api/projects/p1": project,
      "GET /api/projects/p1/sessions": [session("s1", "Older")],
      "GET /api/sessions/s1/sandbox": {
        name: "sandbox-exec",
        active: true,
        writable: ["/code/forge"],
        network: false,
        problem: null,
      },
    });
    render(<ProjectPage projectId="p1" sessionId="s1" />);
    const badge = await screen.findByRole("group", { name: /sandbox/i });
    expect(badge).toHaveTextContent("sandbox-exec");
    expect(badge).toHaveTextContent("forge");
  });
});
