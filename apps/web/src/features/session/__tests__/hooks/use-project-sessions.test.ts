import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { createFakeSocket, FakeSocket } from "@/test/fake-socket";
import { useProjectSessions } from "../../hooks/use-project-sessions";

const session = (id: string, running = false) => ({
  id,
  project_id: "p1",
  title: id,
  created_at: 1,
  updated_at: 1,
  running,
});

beforeEach(() => FakeSocket.reset());
afterEach(() => vi.unstubAllGlobals());

function setup() {
  return renderHook(() => useProjectSessions("p1", { createSocket: createFakeSocket }));
}

describe("useProjectSessions", () => {
  it("refreshes every copy of a project's list when one of them reloads", async () => {
    let list = [session("a")];
    fakeFetch({ "GET /api/projects/p1/sessions": () => ({ body: list }) });
    const page = setup();
    const sidebar = setup();
    await waitFor(() => expect(sidebar.result.current.sessions).toEqual([session("a")]));

    list = [session("a"), session("b")];
    act(() => page.result.current.reload());
    await waitFor(() => expect(sidebar.result.current.sessions).toHaveLength(2));
    expect(page.result.current.sessions).toHaveLength(2);
  });

  it("fetches nothing and opens no socket without a project", () => {
    const fetch = fakeFetch({});
    const { result } = renderHook(() =>
      useProjectSessions(null, { createSocket: createFakeSocket }),
    );
    expect(result.current.sessions).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads the project's sessions", async () => {
    fakeFetch({ "GET /api/projects/p1/sessions": [session("a")] });
    const { result } = setup();
    expect(result.current.sessions).toBeNull();
    await waitFor(() => expect(result.current.sessions).toEqual([session("a")]));
  });

  it("reloads when a turn starts or ends so status and titles stay live", async () => {
    let running = false;
    const fetch = fakeFetch({
      "GET /api/projects/p1/sessions": () => ({ body: [session("a", running)] }),
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.sessions).not.toBeNull());

    running = true;
    act(() => FakeSocket.latest().emit({ type: "turn_started", session_id: "a", turn: 1 }));
    await waitFor(() => expect(result.current.sessions?.[0].running).toBe(true));

    running = false;
    act(() => FakeSocket.latest().emit({ type: "done", session_id: "a" }));
    await waitFor(() => expect(result.current.sessions?.[0].running).toBe(false));

    const calls = fetch.mock.calls.length;
    act(() => FakeSocket.latest().emit({ type: "output", session_id: "a", chunk: "x" }));
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it("reloads when another tab changes a session's approval mode", async () => {
    const fetch = fakeFetch({ "GET /api/projects/p1/sessions": [session("a", false)] });
    const { result } = setup();
    await waitFor(() => expect(result.current.sessions).not.toBeNull());
    const calls = fetch.mock.calls.length;
    act(() =>
      FakeSocket.latest().emit({ type: "approval_mode_changed", session_id: "a", mode: "ask" }),
    );
    await waitFor(() => expect(fetch.mock.calls.length).toBe(calls + 1));
  });

  it("reports a load error", async () => {
    fakeFetch({
      "GET /api/projects/p1/sessions": () => ({ status: 500, body: { error: "boom" } }),
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toBe("boom"));
  });

  it("closes its socket on unmount", () => {
    fakeFetch({ "GET /api/projects/p1/sessions": [] });
    const { unmount } = setup();
    const socket = FakeSocket.latest();
    unmount();
    expect(socket.closed).toBe(true);
  });
});
