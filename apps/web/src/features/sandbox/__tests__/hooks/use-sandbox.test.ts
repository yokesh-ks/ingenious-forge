import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxInfo } from "@/api/types";
import { fakeFetch } from "@/test/fake-fetch";
import { FakeSocket } from "@/test/fake-socket";
import { useSandbox } from "../../hooks/use-sandbox";

const createSocket = (url: string) => new FakeSocket(url) as unknown as WebSocket;
const info = (writable: string[]): SandboxInfo => ({
  name: "bubblewrap",
  active: true,
  writable,
  network: false,
  problem: null,
});

describe("useSandbox", () => {
  beforeEach(() => FakeSocket.reset());
  afterEach(() => vi.unstubAllGlobals());

  it("loads the session's sandbox", async () => {
    fakeFetch({ "GET /api/sessions/s1/sandbox": info(["/p"]) });
    const { result } = renderHook(() => useSandbox("s1", { createSocket }));
    await waitFor(() => expect(result.current.sandbox).toEqual(info(["/p"])));
  });

  it("follows changes to its own session's writable folders", async () => {
    fakeFetch({ "GET /api/sessions/s1/sandbox": info(["/p"]) });
    const { result } = renderHook(() => useSandbox("s1", { createSocket }));
    await waitFor(() => expect(result.current.sandbox).not.toBeNull());

    act(() =>
      FakeSocket.latest().emit({
        type: "sandbox_changed",
        session_id: "other",
        sandbox: info(["/x"]),
      }),
    );
    expect(result.current.sandbox?.writable).toEqual(["/p"]);
    act(() =>
      FakeSocket.latest().emit({
        type: "sandbox_changed",
        session_id: "s1",
        sandbox: info(["/p", "/cache"]),
      }),
    );
    expect(result.current.sandbox?.writable).toEqual(["/p", "/cache"]);
  });

  it("reports why the sandbox could not be loaded", async () => {
    fakeFetch({
      "GET /api/sessions/s1/sandbox": () => ({ status: 404, body: { error: "session not found" } }),
    });
    const { result } = renderHook(() => useSandbox("s1", { createSocket }));
    await waitFor(() => expect(result.current.error).toBe("session not found"));
  });
});
