import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import WorkspacePanel, { type WorkspacePanelControl } from "../../components/WorkspacePanel";

vi.mock("@/features/terminal/components/TerminalPanel", () => ({ default: () => null }));

const project = { id: "p1", name: "p", path: "/work/p" };

type Files = Record<string, string | number>;

function routes(files: Files) {
  return fakeFetch({
    "GET /api/projects/p1": project,
    "GET /api/projects/p1/directory": (_: RequestInit | undefined, url: URL) => {
      const dir = url.searchParams.get("path") ?? "";
      if (dir === "src") {
        return { body: { entries: [{ name: "main.rs", kind: "file" }], truncated: false } };
      }
      return {
        body: {
          entries: [
            { name: "README.md", kind: "file" },
            { name: "src", kind: "directory" },
            { name: ".git", kind: "directory" },
            { name: "link", kind: "other" },
          ],
          truncated: false,
        },
      };
    },
    "GET /api/projects/p1/file": (_: RequestInit | undefined, url: URL) => {
      const path = url.searchParams.get("path") ?? "";
      const file = files[path];
      if (typeof file === "number") return { status: file, body: { error: "server says no" } };
      if (file === undefined) return { status: 404, body: { error: "missing" } };
      return { body: { path, content: file } };
    },
    "POST /api/projects/p1/open-in": project,
  });
}

function setup(
  files: Files = { "README.md": "# Title\n\nBody text.\n", "src/main.rs": "fn main() {}\n" },
) {
  const fetch = routes(files);
  const control = createRef<WorkspacePanelControl>();
  render(
    <WorkspacePanel
      projectId="p1"
      sessionId="s1"
      changedFiles={[]}
      onRevertAll={() => {}}
      busy={false}
      control={control}
    />,
  );
  return { fetch, control };
}

const panel = () => screen.getByLabelText("Workspace panel");
const tabs = () =>
  within(panel())
    .getAllByRole("tab")
    .map((t) => t.textContent);
const reads = (fetch: ReturnType<typeof fakeFetch>, path: string) =>
  fetch.mock.calls.filter(([url]) => String(url).includes(`/file?path=${encodeURIComponent(path)}`))
    .length;

async function open(
  control: React.RefObject<WorkspacePanelControl | null>,
  path: string,
  line?: number,
) {
  await waitFor(() => expect(control.current).not.toBeNull());
  act(() => control.current?.openFile({ path, line }));
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});
afterEach(() => vi.unstubAllGlobals());

describe("a file opened from a link", () => {
  it("opens the panel on a tab named for the file, rendered as Markdown", async () => {
    const { control } = setup();
    await open(control, "README.md");
    expect(tabs()).toEqual(["README.md"]);
    expect(await within(panel()).findByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Open with" })).toHaveTextContent(
      "Markdown",
    );
  });

  it("shows the full path with the project's folder", async () => {
    const { control } = setup();
    await waitFor(() => expect(control.current).not.toBeNull());
    await screen.findByRole("button", { name: "Open right sidebar" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await open(control, "/work/p/README.md");
    expect(tabs()).toEqual(["README.md"]);
    expect(await screen.findByTitle("/work/p/README.md")).toHaveTextContent("/work/p/README.md");
  });

  it("selects the tab a file already has instead of opening another", async () => {
    const { control, fetch } = setup();
    await open(control, "README.md");
    await within(panel()).findByRole("heading", { name: "Title" });
    await open(control, "src/main.rs");
    await open(control, "README.md");
    expect(tabs()).toEqual(["README.md", "main.rs"]);
    expect(within(panel()).getByRole("tab", { name: /README/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(reads(fetch, "README.md")).toBe(1);
  });
});

describe("the file's controls", () => {
  it("switches between Markdown, code and plain text; code adds wrap", async () => {
    const { control } = setup();
    const user = userEvent.setup();
    await open(control, "README.md");
    await within(panel()).findByRole("heading", { name: "Title" });
    expect(within(panel()).queryByRole("button", { name: "Line wrap" })).toBeNull();

    await user.click(within(panel()).getByRole("button", { name: "Open with" }));
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
      "Markdown",
      "Code",
      "Plain text",
    ]);
    await user.click(screen.getByRole("menuitemradio", { name: "Code" }));
    expect(within(panel()).queryByRole("heading", { name: "Title" })).toBeNull();
    expect(within(panel()).getByText("markdown")).toBeInTheDocument();
    const wrap = within(panel()).getByRole("button", { name: "Line wrap" });
    expect(wrap).toHaveAttribute("aria-pressed", "true");
    await user.click(wrap);
    expect(wrap).toHaveAttribute("aria-pressed", "false");

    await user.click(within(panel()).getByRole("button", { name: "Open with" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Plain text" }));
    expect(within(panel()).getByText("# Title")).toBeInTheDocument();
  });

  it("has no viewer choice when plain text is the only one", async () => {
    const { control } = setup({ LICENSE: "text" });
    await open(control, "LICENSE");
    await within(panel()).findByText("text");
    expect(within(panel()).queryByRole("button", { name: "Open with" })).toBeNull();
  });

  it("reloads the file on request", async () => {
    const files: Files = { LICENSE: "first" };
    const { control, fetch } = setup(files);
    const user = userEvent.setup();
    await open(control, "LICENSE");
    await within(panel()).findByText("first");
    files.LICENSE = "second";
    await user.click(within(panel()).getByRole("button", { name: "Read the file again" }));
    await within(panel()).findByText("second");
    expect(reads(fetch, "LICENSE")).toBe(2);
  });

  it("opens the file in VS Code, the default app, or shows it in its folder", async () => {
    const { control, fetch } = setup();
    const user = userEvent.setup();
    await open(control, "README.md");
    await within(panel()).findByRole("heading", { name: "Title" });
    await user.click(within(panel()).getByRole("button", { name: "Open in VS Code" }));
    const bodies = () =>
      fetch.mock.calls
        .filter(([, init]) => init?.method === "POST")
        .map(([, init]) => JSON.parse(String(init?.body)));
    await waitFor(() => expect(bodies()).toHaveLength(1));
    await waitFor(() =>
      expect(within(panel()).getByRole("button", { name: "Open in VS Code" })).toBeEnabled(),
    );
    await user.click(within(panel()).getByRole("button", { name: "More ways to open" }));
    await user.click(screen.getByRole("menuitem", { name: "Show file location" }));
    await waitFor(() => expect(bodies()).toHaveLength(2));
    expect(bodies()).toEqual([
      { app: "vs_code", path: "README.md" },
      { app: "file_manager", path: "README.md" },
    ]);
  });
});

describe("a file that cannot be shown", () => {
  it("explains a missing file and keeps Reload", async () => {
    const { control } = setup({});
    await open(control, "gone.txt");
    expect(await within(panel()).findByText(/File not found/)).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Read the file again" })).toBeEnabled();
    expect(within(panel()).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("offers Retry for an unexplained failure, and recovers", async () => {
    const files: Files = { "a.txt": 500 };
    const { control } = setup(files);
    const user = userEvent.setup();
    await open(control, "a.txt");
    await within(panel()).findByText("Read failed: server says no");
    files["a.txt"] = "fine now";
    await user.click(within(panel()).getByRole("button", { name: "Retry" }));
    expect(await within(panel()).findByText("fine now")).toBeInTheDocument();
  });

  it("offers to open a file too large to show", async () => {
    const { control } = setup({ "a.txt": 413 });
    await open(control, "a.txt");
    await within(panel()).findByText(/2 MB/);
    expect(within(panel()).getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("does not try to read a binary file", async () => {
    const { control, fetch } = setup();
    await open(control, "forge.db");
    expect(
      await within(panel()).findByText(/not available for this file type/),
    ).toBeInTheDocument();
    expect(reads(fetch, "forge.db")).toBe(0);
  });

  it("keeps the text on screen when a later read fails", async () => {
    const files: Files = { LICENSE: "kept" };
    const { control } = setup(files);
    const user = userEvent.setup();
    await open(control, "LICENSE");
    await within(panel()).findByText("kept");
    files.LICENSE = 404;
    await user.click(within(panel()).getByRole("button", { name: "Read the file again" }));
    expect(await within(panel()).findByText(/File not found/)).toBeInTheDocument();
    expect(within(panel()).getByText("kept")).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

describe("the file tree beside a file", () => {
  it("starts hidden, and marks the current file when shown", async () => {
    const { control } = setup();
    const user = userEvent.setup();
    await open(control, "src/main.rs");
    await within(panel()).findByText("fn main() {}");
    expect(within(panel()).queryByRole("button", { name: "src" })).toBeNull();

    await user.click(within(panel()).getByRole("button", { name: "Show file tree" }));
    const row = await within(panel()).findByRole("button", { name: "main.rs" });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(panel()).getByRole("button", { name: "src" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(panel()).getByRole("button", { name: "Hide file tree" })).toBeInTheDocument();
  });

  it("opens a picked file in the same tab", async () => {
    const { control } = setup();
    const user = userEvent.setup();
    await open(control, "src/main.rs");
    await within(panel()).findByText("fn main() {}");
    await user.click(within(panel()).getByRole("button", { name: "Show file tree" }));
    await user.click(await within(panel()).findByRole("button", { name: "README.md" }));
    expect(tabs()).toEqual(["README.md"]);
    expect(await within(panel()).findByRole("heading", { name: "Title" })).toBeInTheDocument();
  });

  it("closes on Escape and gives the keyboard to the toggle", async () => {
    const { control } = setup();
    const user = userEvent.setup();
    await open(control, "src/main.rs");
    await within(panel()).findByText("fn main() {}");
    await user.click(within(panel()).getByRole("button", { name: "Show file tree" }));
    (await within(panel()).findByRole("button", { name: "main.rs" })).focus();
    await user.keyboard("{Escape}");
    const toggle = within(panel()).getByRole("button", { name: "Show file tree" });
    expect(toggle).toHaveFocus();
  });
});

describe("when the agent works on an open file", () => {
  it("reads it again as its change grows and when the turn ends", async () => {
    const files: Files = { "a.txt": "first" };
    const fetch = routes(files);
    const control = createRef<WorkspacePanelControl>();
    const view = (diff: string | null, busy: boolean) => (
      <WorkspacePanel
        projectId="p1"
        sessionId="s1"
        changedFiles={diff === null ? [] : [{ path: "a.txt", diff, additions: 1, deletions: 0 }]}
        onRevertAll={() => {}}
        busy={busy}
        control={control}
      />
    );
    const { rerender } = render(view(null, true));
    await open(control, "a.txt");
    await within(panel()).findByText("first");

    files["a.txt"] = "second";
    rerender(view("+second", true));
    await within(panel()).findByText("second");

    files["a.txt"] = "third";
    rerender(view("+second", false));
    await within(panel()).findByText("third");
    expect(reads(fetch, "a.txt")).toBe(3);
  });
});

describe("keyboard and reveals", () => {
  it("shows the tree beside an open file on the files shortcut", async () => {
    const { control } = setup();
    await open(control, "src/main.rs");
    await within(panel()).findByText("fn main() {}");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyP", metaKey: true, altKey: true }),
      );
    });
    expect(await within(panel()).findByRole("button", { name: "main.rs" })).toBeInTheDocument();
    expect(tabs()).toEqual(["main.rs"]);
  });

  it("marks only the line most recently asked for", async () => {
    const { control } = setup({ LICENSE: "one\ntwo\nthree\n" });
    await open(control, "LICENSE", 2);
    await within(panel()).findByText("two");
    const marked = () =>
      [...panel().querySelectorAll("[data-line-mark]")].map((e) => e.textContent);
    await waitFor(() => expect(marked()).toEqual(["two"]));
    await open(control, "LICENSE", 3);
    await waitFor(() => expect(marked()).toEqual(["three"]));
  });

  it("glows only when the file is already on screen", async () => {
    const { control } = setup();
    const glows = () => panel().querySelectorAll('[class*="panel-glow"]').length;
    await open(control, "README.md");
    expect(glows()).toBe(0);
    await open(control, "README.md");
    expect(glows()).toBe(1);
  });
});

describe("the Workspace files page", () => {
  const start = async () => {
    const user = userEvent.setup();
    const result = setup();
    await user.click(screen.getByRole("button", { name: "Open right sidebar" }));
    await user.click(within(panel()).getByRole("button", { name: /^Workspace files/ }));
    return { user, ...result };
  };

  it("lists folders first, with hidden ones, and greys what cannot open", async () => {
    await start();
    const rows = await within(panel()).findAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([".git", "src", "link", "README.md"]);
    expect(within(panel()).queryByRole("button", { name: "link" })).toBeNull();
  });

  it("lists a folder when it opens", async () => {
    const { user, fetch } = await start();
    await user.click(await within(panel()).findByRole("button", { name: "src" }));
    expect(await within(panel()).findByRole("button", { name: "main.rs" })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("directory?path=src"))).toBe(true);
  });

  it("opens a picked file in a new tab and stays open", async () => {
    const { user } = await start();
    await user.click(await within(panel()).findByRole("button", { name: "README.md" }));
    expect(tabs()).toEqual(["Files", "README.md"]);
  });

  it("offers the folder's programs", async () => {
    const { user } = await start();
    await user.click(await within(panel()).findByRole("button", { name: "More ways to open" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      expect.stringContaining("(default)"),
      "VS Code",
      "Terminal",
    ]);
  });
});
