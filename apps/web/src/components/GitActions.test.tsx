import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitStatus } from "@/api/types";
import { fakeFetch } from "@/test/fake-fetch";
import GitActions from "./GitActions";

afterEach(() => vi.unstubAllGlobals());

const dirty: GitStatus = { branch: "main", detached: false, staged: 0, changed: 2 };
const clean: GitStatus = { branch: "main", detached: false, staged: 0, changed: 0 };

function setup(status: GitStatus = dirty) {
  const onChanged = vi.fn();
  render(<GitActions projectId="p1" sessionId="s1" status={status} onChanged={onChanged} />);
  return { onChanged };
}

const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body));

describe("GitActions", () => {
  it("creates and checks out a branch", async () => {
    const fetch = fakeFetch({
      "POST /api/projects/p1/git/branch": { ...clean, branch: "feat/x" },
    });
    const { onChanged } = setup();
    await userEvent.click(screen.getByRole("button", { name: /new branch/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /branch name/i }), "feat/x{Enter}");

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(body(fetch.mock.calls[0][1])).toEqual({ name: "feat/x" });
    expect(screen.queryByRole("textbox", { name: /branch name/i })).not.toBeInTheDocument();
  });

  it("shows why a branch could not be created", async () => {
    fakeFetch({
      "POST /api/projects/p1/git/branch": () => ({
        status: 400,
        body: { error: "a branch named main already exists" },
      }),
    });
    const { onChanged } = setup();
    await userEvent.click(screen.getByRole("button", { name: /new branch/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /branch name/i }), "main{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("commits with the agent's draft after the user edits it", async () => {
    const fetch = fakeFetch({
      "POST /api/sessions/s1/commit-message": { message: "feat: add parser" },
      "POST /api/projects/p1/git/commit": { sha: "abc1234", summary: "feat: add the parser" },
    });
    const { onChanged } = setup();
    await userEvent.click(screen.getByRole("button", { name: /^commit/i }));
    const box = await screen.findByRole("textbox", { name: /commit message/i });
    await waitFor(() => expect(box).toHaveValue("feat: add parser"));

    await userEvent.clear(box);
    await userEvent.type(box, "feat: add the parser");
    await userEvent.click(screen.getByRole("button", { name: /commit changes/i }));

    expect(await screen.findByText(/committed abc1234/i)).toBeInTheDocument();
    const post = fetch.mock.calls.find(([url]) => String(url).endsWith("/git/commit"));
    expect(body(post?.[1])).toEqual({ message: "feat: add the parser" });
    expect(onChanged).toHaveBeenCalled();
  });

  it("still lets the user write a message when the draft fails", async () => {
    fakeFetch({
      "POST /api/sessions/s1/commit-message": () => ({
        status: 502,
        body: { error: "no model provider is configured" },
      }),
      "POST /api/projects/p1/git/commit": { sha: "def5678", summary: "fix: x" },
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /^commit/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no model provider");
    await userEvent.type(screen.getByRole("textbox", { name: /commit message/i }), "fix: x");
    await userEvent.click(screen.getByRole("button", { name: /commit changes/i }));
    expect(await screen.findByText(/committed def5678/i)).toBeInTheDocument();
  });

  it("shows why a commit failed and keeps the message", async () => {
    fakeFetch({
      "POST /api/sessions/s1/commit-message": { message: "feat: x" },
      "POST /api/projects/p1/git/commit": () => ({
        status: 400,
        body: { error: "nothing to commit" },
      }),
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /^commit/i }));
    const box = await screen.findByRole("textbox", { name: /commit message/i });
    await waitFor(() => expect(box).toHaveValue("feat: x"));
    await userEvent.click(screen.getByRole("button", { name: /commit changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nothing to commit");
    expect(box).toHaveValue("feat: x");
  });

  it("disables committing an empty message", async () => {
    fakeFetch({ "POST /api/sessions/s1/commit-message": { message: "x" } });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /^commit/i }));
    const box = await screen.findByRole("textbox", { name: /commit message/i });
    await waitFor(() => expect(box).toHaveValue("x"));
    await userEvent.clear(box);
    expect(screen.getByRole("button", { name: /commit changes/i })).toBeDisabled();
  });

  it("offers no commit when there is nothing to commit", () => {
    setup(clean);
    expect(screen.getByRole("button", { name: /^commit/i })).toBeDisabled();
  });
});
