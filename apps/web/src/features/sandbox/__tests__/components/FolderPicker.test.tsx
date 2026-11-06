import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import FolderPicker from "../../components/FolderPicker";

afterEach(() => vi.unstubAllGlobals());

const listings: Record<string, unknown> = {
  home: {
    path: "/home/me",
    parent: "/home",
    is_git_repo: false,
    entries: [
      { name: "code", path: "/home/me/code", is_git_repo: false },
      { name: "forge", path: "/home/me/forge", is_git_repo: true },
    ],
  },
  "/home/me/code": {
    path: "/home/me/code",
    parent: "/home/me",
    is_git_repo: false,
    entries: [],
  },
  "/home/me/forge": {
    path: "/home/me/forge",
    parent: "/home/me",
    is_git_repo: true,
    entries: [],
  },
};

listings["/home/me"] = listings.home;

function serveListings() {
  return fakeFetch({
    "GET /api/fs/dirs": (_init: unknown, url: URL) => {
      const path = url.searchParams.get("path") ?? "home";
      return path in listings
        ? { body: listings[path] }
        : { status: 400, body: { error: `cannot list ${path}` } };
    },
  });
}

describe("FolderPicker", () => {
  it("starts in the home folder and lists sub-folders", async () => {
    serveListings();
    render(<FolderPicker onPick={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText("/home/me")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "forge" })).toBeInTheDocument();
  });

  it("marks repositories and opens one directly", async () => {
    serveListings();
    const onPick = vi.fn();
    render(<FolderPicker onPick={onPick} onCancel={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open forge" }));
    expect(onPick).toHaveBeenCalledWith("/home/me/forge");
    expect(screen.queryByRole("button", { name: "Open code" })).not.toBeInTheDocument();
  });

  it("moves into a folder and back up", async () => {
    serveListings();
    render(<FolderPicker onPick={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "code" }));
    expect(await screen.findByText("/home/me/code")).toBeInTheDocument();
    expect(screen.getByText(/no folders here/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /up/i }));
    expect(await screen.findByText("/home/me")).toBeInTheDocument();
  });

  it("offers to open the current folder when it is a repository", async () => {
    serveListings();
    const onPick = vi.fn();
    render(<FolderPicker onPick={onPick} onCancel={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "forge" }));
    await userEvent.click(await screen.findByRole("button", { name: /open this folder/i }));
    expect(onPick).toHaveBeenCalledWith("/home/me/forge");
  });

  it("shows a listing error", async () => {
    fakeFetch({ "GET /api/fs/dirs": () => ({ status: 400, body: { error: "cannot list ~" } }) });
    render(<FolderPicker onPick={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot list ~");
  });

  it("can be cancelled", async () => {
    serveListings();
    const onCancel = vi.fn();
    render(<FolderPicker onPick={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });
});
