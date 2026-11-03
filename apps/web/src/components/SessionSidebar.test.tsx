import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/api/types";
import SessionSidebar from "./SessionSidebar";

afterEach(() => window.history.replaceState(null, "", "/"));

const now = Date.now();
const sessions: Session[] = [
  {
    id: "s1",
    project_id: "p1",
    title: "Fix login",
    created_at: 1,
    updated_at: now - 120_000,
    running: true,
  },
  {
    id: "s2",
    project_id: "p1",
    title: "Add tests",
    created_at: 1,
    updated_at: now - 3 * 3_600_000,
    running: false,
  },
];

describe("SessionSidebar", () => {
  it("lists each session with title and last activity", () => {
    render(<SessionSidebar projectId="p1" sessions={sessions} activeId="s2" />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Fix login"),
      expect.stringContaining("Add tests"),
    ]);
    expect(links[0]).toHaveTextContent("2 minutes ago");
    expect(links[1]).toHaveTextContent("3 hours ago");
  });

  it("marks running sessions with a live status", () => {
    render(<SessionSidebar projectId="p1" sessions={sessions} activeId="s2" />);
    const running = screen.getAllByRole("status");
    expect(running).toHaveLength(1);
    expect(running[0]).toHaveAccessibleName("Running");
    expect(screen.getAllByRole("link")[0]).toContainElement(running[0]);
  });

  it("highlights the open session", () => {
    render(<SessionSidebar projectId="p1" sessions={sessions} activeId="s2" />);
    expect(screen.getByRole("link", { name: /add tests/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /fix login/i })).not.toHaveAttribute("aria-current");
  });

  it("switches sessions without a page load", async () => {
    render(<SessionSidebar projectId="p1" sessions={sessions} activeId="s2" />);
    await userEvent.click(screen.getByRole("link", { name: /fix login/i }));
    expect(window.location.pathname).toBe("/projects/p1/sessions/s1");
  });

  it("has a New session button", async () => {
    const onNewSession = vi.fn();
    render(
      <SessionSidebar
        projectId="p1"
        sessions={sessions}
        activeId="s2"
        onNewSession={onNewSession}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /new session/i }));
    expect(onNewSession).toHaveBeenCalledOnce();
  });

  it("disables New session while one is being created", () => {
    render(
      <SessionSidebar
        projectId="p1"
        sessions={sessions}
        activeId="s2"
        onNewSession={vi.fn()}
        creating
      />,
    );
    expect(screen.getByRole("button", { name: /new session/i })).toBeDisabled();
  });

  it("shows a loading state", () => {
    render(<SessionSidebar projectId="p1" sessions={null} activeId={null} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
