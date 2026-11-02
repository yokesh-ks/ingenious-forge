import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import { ApiRequestError, api } from "./client";

afterEach(() => vi.unstubAllGlobals());

const project = { id: "p1", name: "forge", path: "/code/forge", last_opened_at: 1 };

describe("api client", () => {
  it("lists recent projects", async () => {
    fakeFetch({ "GET /api/projects": [project] });
    await expect(api.recentProjects()).resolves.toEqual([project]);
  });

  it("posts the folder path to open a project", async () => {
    const fetch = fakeFetch({ "POST /api/projects": project });
    await api.openProject("/code/forge");
    const [, init] = fetch.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ path: "/code/forge" });
  });

  it("encodes the folder picker path as a query parameter", async () => {
    const fetch = fakeFetch({
      "GET /api/fs/dirs": { path: "/a b", parent: "/", is_git_repo: false, entries: [] },
    });
    await api.listDirs("/a b");
    expect(String(fetch.mock.calls[0][0])).toBe("/api/fs/dirs?path=%2Fa+b");
    await api.listDirs();
    expect(String(fetch.mock.calls[1][0])).toBe("/api/fs/dirs");
  });

  it("throws the server's error message on failure", async () => {
    fakeFetch({
      "POST /api/projects": () => ({ status: 400, body: { error: "not a git repository" } }),
    });
    const failure = api.openProject("/tmp");
    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toThrow("not a git repository");
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(api.recentProjects()).rejects.toThrow(/cannot reach the forge server/i);
  });
});
