import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket } from "@/test/fake-socket";
import { useGitStatus } from "../../hooks/use-git-status";

const createSocket = (url: string) => new FakeSocket(url) as unknown as WebSocket;
const status = (changed: number) => ({ branch: "main", detached: false, staged: 0, changed });

describe("useGitStatus", () => {
  beforeEach(() => FakeSocket.reset());
  afterEach(() => vi.unstubAllGlobals());

  it("loads the project's git status", async () => {
    fakeFetch({ "GET /api/projects/p1/git/status": status(0) });
    const { result } = renderHook(() => useGitStatus("p1", { createSocket }));
    await waitFor(() => expect(result.current.status).toEqual(status(0)));
  });

  it("reloads after the agent changes files or a turn ends", async () => {
    let changed = 0;
    const fetch = fakeFetch({
      "GET /api/projects/p1/git/status": () => ({ body: status(changed) }),
    });
    const { result } = renderHook(() => useGitStatus("p1", { createSocket }));
    await waitFor(() => expect(result.current.status).not.toBeNull());

    changed = 2;
    act(() =>
      FakeSocket.latest().emit({
        type: "file_changed",
        session_id: "s1",
        path: "a",
        diff: "",
        additions: 1,
        deletions: 0,
      }),
    );
    await waitFor(() => expect(result.current.status?.changed).toBe(2));

    const calls = fetch.mock.calls.length;
    act(() => FakeSocket.latest().emit({ type: "output", session_id: "s1", chunk: "x" }));
    expect(fetch.mock.calls.length).toBe(calls);
    act(() => FakeSocket.latest().emit({ type: "done", session_id: "s1" }));
    await waitFor(() => expect(fetch.mock.calls.length).toBe(calls + 1));
  });

  it("reports why the status could not be read", async () => {
    fakeFetch({
      "GET /api/projects/p1/git/status": () => ({ status: 400, body: { error: "not a repo" } }),
    });
    const { result } = renderHook(() => useGitStatus("p1", { createSocket }));
    await waitFor(() => expect(result.current.error).toBe("not a repo"));
    expect(result.current.status).toBeNull();
  });
});
