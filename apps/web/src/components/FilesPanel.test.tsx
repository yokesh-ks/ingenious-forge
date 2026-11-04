import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import FilesPanel from "./FilesPanel";

afterEach(() => vi.unstubAllGlobals());

describe("FilesPanel", () => {
  it("loads the project's files and opens one read-only", async () => {
    const fetch = fakeFetch({
      "GET /api/projects/p1/files": { files: ["src/main.rs", "README.md"], truncated: false },
      "GET /api/projects/p1/file": (_init: RequestInit | undefined, url: URL) => ({
        body: { path: url.searchParams.get("path"), content: "fn main() {}" },
      }),
    });
    render(<FilesPanel projectId="p1" />);
    expect(screen.getByText(/loading files/i)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "src" }));
    await userEvent.click(screen.getByRole("button", { name: "main.rs" }));

    const viewer = await screen.findByRole("region", { name: /src\/main\.rs/ });
    expect(viewer).toHaveTextContent("fn main() {}");
    expect(viewer.querySelector("textarea, [contenteditable]")).toBeNull();
    const fileCall = fetch.mock.calls.find(([url]) => String(url).includes("/file?"));
    expect(String(fileCall?.[0])).toBe("/api/projects/p1/file?path=src%2Fmain.rs");
  });

  it("closes the viewer to return to the tree", async () => {
    fakeFetch({
      "GET /api/projects/p1/files": { files: ["a.txt"], truncated: false },
      "GET /api/projects/p1/file": { path: "a.txt", content: "hello" },
    });
    render(<FilesPanel projectId="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "a.txt" }));
    await screen.findByRole("region", { name: "a.txt" });
    await userEvent.click(screen.getByRole("button", { name: /close file/i }));
    expect(screen.queryByRole("region", { name: "a.txt" })).not.toBeInTheDocument();
  });

  it("shows why a file cannot be shown", async () => {
    fakeFetch({
      "GET /api/projects/p1/files": { files: ["bin.dat"], truncated: false },
      "GET /api/projects/p1/file": () => ({
        status: 400,
        body: { error: "bin.dat is not a UTF-8 text file" },
      }),
    });
    render(<FilesPanel projectId="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "bin.dat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a UTF-8 text file");
  });

  it("shows why the file list could not be loaded", async () => {
    fakeFetch({
      "GET /api/projects/p1/files": () => ({ status: 404, body: { error: "project not found" } }),
    });
    render(<FilesPanel projectId="p1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("project not found");
  });

  it("says when the list was cut short", async () => {
    fakeFetch({ "GET /api/projects/p1/files": { files: ["a"], truncated: true } });
    render(<FilesPanel projectId="p1" />);
    expect(await screen.findByText(/not every file is listed/i)).toBeInTheDocument();
  });

  it("reloads the list on request", async () => {
    let files = ["a.txt"];
    fakeFetch({ "GET /api/projects/p1/files": () => ({ body: { files, truncated: false } }) });
    render(<FilesPanel projectId="p1" />);
    await screen.findByRole("button", { name: "a.txt" });
    files = ["a.txt", "b.txt"];
    await userEvent.click(screen.getByRole("button", { name: /refresh files/i }));
    expect(await screen.findByRole("button", { name: "b.txt" })).toBeInTheDocument();
  });
});
