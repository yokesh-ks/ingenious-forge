import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import WorkspacePanel, { type WorkspacePanelControl } from "../../components/WorkspacePanel";

vi.mock("@/features/terminal/components/TerminalPanel", () => ({ default: () => null }));

const NO_LOG = { events: [], hasOlder: false, loadingOlder: false, onLoadOlder: () => {} };
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
      log={NO_LOG}
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

vi.mock("../../components/PdfBody", () => ({
  default: ({ data }: { data: Uint8Array }) => (
    <div data-testid="pdf-body">{data.length} bytes</div>
  ),
}));
vi.mock("../../components/SheetBody", () => ({
  default: ({ format }: { format: string }) => <div data-testid="sheet-body">{format}</div>,
}));

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
    await waitFor(() => expect(control.current).not.toBeNull());
    fireEvent.keyDown(window, { code: "KeyB", metaKey: true, shiftKey: true });
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
      { app: "vs_code", path: "README.md", application: null },
      { app: "file_manager", path: "README.md", application: null },
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
        log={NO_LOG}
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
    fireEvent.keyDown(window, { code: "KeyB", metaKey: true, shiftKey: true });
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

describe("viewers for other kinds of file", () => {
  const open = async (path: string, content = "", { officeStatus = 200 } = {}) => {
    const mock = fakeFetch({
      "GET /api/projects/p1": { id: "p1", name: "p", path: "/work/p" },
      "GET /api/projects/p1/file": { path, content },
      "GET /api/projects/p1/file/applications": { applications: [] },
    });
    const routed = mock.getMockImplementation();
    // These answer with bytes, which the JSON helper cannot.
    mock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/file/raw")) return new Response(new Uint8Array([1, 2, 3, 4]));
      if (url.includes("/file/office-pdf")) {
        return officeStatus === 200
          ? new Response(new Uint8Array([1]), {
              headers: { "x-missing-fonts": encodeURIComponent('["Calibri"]') },
            })
          : new Response(JSON.stringify({ error: "cannot convert" }), { status: officeStatus });
      }
      return routed?.(input, init) as Promise<Response>;
    });
    const control: { current: WorkspacePanelControl | null } = { current: null };
    render(
      <WorkspacePanel
        projectId="p1"
        sessionId="s1"
        log={NO_LOG}
        changedFiles={[]}
        onRevertAll={() => {}}
        busy={false}
        control={control}
      />,
    );
    await waitFor(() => expect(control.current).not.toBeNull());
    act(() => control.current?.openFile({ path }));
  };

  it("shows an image from its bytes, and does not offer plain text", async () => {
    await open("logo.png");
    const image = await screen.findByAltText("Preview of logo.png");
    expect(image.getAttribute("src")).toContain("/file/raw?path=logo.png");
    expect(screen.queryByRole("button", { name: "Open with" })).toBeNull();
  });

  it("zooms an image from the controls, and fits it again", async () => {
    await open("logo.png");
    const image = await screen.findByAltText("Preview of logo.png");
    Object.defineProperty(image, "naturalWidth", { value: 400 });
    fireEvent.load(image);
    const frame = image.closest("[data-document-zoom-frame]") as HTMLElement;
    expect(frame).toHaveAttribute("data-document-zoom-mode", "fit-width");
    fireEvent.click(await screen.findByRole("button", { name: "Zoom in" }));
    expect(frame).toHaveAttribute("data-document-zoom-mode", "fixed");
    // jsdom's pane has no width, so one step up lands on the smallest scale.
    expect(frame.style.getPropertyValue("--document-zoom")).toBe("0.25");
  });

  it("draws a PDF from its bytes", async () => {
    await open("a.pdf");
    expect(await screen.findByTestId("pdf-body")).toHaveTextContent("4 bytes");
  });

  it("shows sheets and CSV in the spreadsheet", async () => {
    await open("a.xlsx");
    expect(await screen.findByTestId("sheet-body")).toHaveTextContent("xlsx");
    expect(screen.queryByRole("button", { name: "Open with" })).toBeNull();
  });

  it("offers CSV as a spreadsheet or plain text", async () => {
    await open("a.csv", "name,age");
    expect(await screen.findByTestId("sheet-body")).toHaveTextContent("csv");
    expect(screen.getByRole("button", { name: "Open with" })).toHaveTextContent("Spreadsheet");
  });

  it("converts an Office file and warns of its missing fonts", async () => {
    await open("a.docx");
    expect(await screen.findByTestId("pdf-body")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Missing fonts: 1. Click to view." }),
    ).toBeInTheDocument();
    expect(String(vi.mocked(fetch).mock.calls.map(([url]) => url))).toContain("/file/office-pdf");
  });

  it("explains an Office file it could not convert, with Retry", async () => {
    await open("bad.ppt", "", { officeStatus: 422 });
    expect(await screen.findByText("cannot convert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("runs HTML in a sandbox, with no access to Forge", async () => {
    URL.createObjectURL = vi.fn(() => "blob:page");
    URL.revokeObjectURL = vi.fn();
    await open("a.html", "<!doctype html><p>hi</p>");
    const frame = await screen.findByTitle("HTML preview: a.html");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("src", "blob:page");
  });

  it("offers the programs the system lists for a file", async () => {
    const fetch = fakeFetch({
      "GET /api/projects/p1": { id: "p1", name: "p", path: "/work/p" },
      "GET /api/projects/p1/file": { path: "a.txt", content: "x" },
      "GET /api/projects/p1/file/applications": {
        applications: [
          { path: "/A.app", name: "Alpha", default: false, icon: null },
          { path: "/B.app", name: "Beta", default: true, icon: "aGk=" },
        ],
      },
      "POST /api/projects/p1/open-in": { id: "p1", name: "p", path: "/work/p" },
    });
    const control: { current: WorkspacePanelControl | null } = { current: null };
    render(
      <WorkspacePanel
        projectId="p1"
        sessionId="s1"
        log={NO_LOG}
        changedFiles={[]}
        onRevertAll={() => {}}
        busy={false}
        control={control}
      />,
    );
    await waitFor(() => expect(control.current).not.toBeNull());
    act(() => control.current?.openFile({ path: "a.txt" }));
    await screen.findByRole("button", { name: "Open in Beta" });
    await userEvent.click(screen.getByRole("button", { name: "More ways to open" }));
    expect(await screen.findByRole("menuitem", { name: "Beta (default)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    const sent = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
      app: "default_app",
      path: "a.txt",
      application: "/A.app",
    });
  });
});
