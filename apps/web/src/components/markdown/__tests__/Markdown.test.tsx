import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenFileContext } from "@/lib/open-file";
import Markdown from "../Markdown";

afterEach(() => vi.restoreAllMocks());

describe("Markdown", () => {
  it("renders headings, emphasis and lists", () => {
    render(<Markdown text={"### Integration\n\nThere is **no shared code**.\n\n- one\n- two"} />);
    expect(screen.getByRole("heading", { level: 3, name: "Integration" })).toBeInTheDocument();
    expect(screen.getByText("no shared code").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["one", "two"]);
  });

  it("renders GFM tables inside a horizontal scroller", () => {
    render(<Markdown text={"| a | b |\n| - | - |\n| 1 | 2 |"} />);
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["1", "2"]);
    expect(table.parentElement).toHaveClass("overflow-x-auto");
  });

  it("needs a double tilde for strikethrough", () => {
    render(<Markdown text={"~~gone~~ and 10~20"} />);
    expect(screen.getByText("gone").tagName).toBe("DEL");
    expect(screen.getByText(/10~20/)).toBeInTheDocument();
  });

  it("shows raw HTML as literal text", () => {
    const { container } = render(<Markdown text={"before <b>x</b> after"} />);
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>x</b>");
  });

  it("opens web links in a new tab and keeps unsafe and local links inert", () => {
    render(
      <Markdown
        text={"[site](https://example.com) [bad](javascript:alert(1)) [local](./src/main.ts)"}
      />,
    );
    const site = screen.getByRole("link", { name: "site" });
    expect(site).toHaveAttribute("href", "https://example.com");
    expect(site).toHaveAttribute("target", "_blank");
    expect(site).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.getByText("bad")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "local" })).toBeNull();
  });

  it("renders a fenced block as a code card labelled with its language", () => {
    render(<Markdown text={"```bash\ncd frontend\n```"} />);
    const card = screen.getByRole("figure", { name: "bash" });
    expect(within(card).getByText("bash")).toBeInTheDocument();
    expect(card.querySelector("pre")?.textContent).toBe("cd frontend");
  });

  it('labels a fence without a language "Code block"', () => {
    render(<Markdown text={"```\nplain\n```"} />);
    expect(screen.getByRole("figure", { name: "Code block" })).toBeInTheDocument();
  });

  it("starts code wrapped and toggles wrapping", () => {
    render(<Markdown text={"```\nx\n```"} />);
    const wrap = screen.getByRole("button", { name: "Wrap lines" });
    const pre = screen.getByRole("figure").querySelector("pre");
    expect(wrap).toHaveAttribute("aria-pressed", "true");
    expect(pre).toHaveClass("whitespace-pre-wrap");
    fireEvent.click(wrap);
    expect(wrap).toHaveAttribute("aria-pressed", "false");
    expect(pre).toHaveClass("whitespace-pre");
  });

  it("copies the exact source of a code block", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Markdown text={"```ts\nconst a = 1;\n\n```"} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledWith("const a = 1;\n");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("highlights a known language", async () => {
    render(<Markdown text={"```ts\nconst a = 1;\n```"} />);
    const card = screen.getByRole("figure", { name: "ts" });
    await vi.waitFor(() => expect(card.querySelector("[data-token]")).not.toBeNull(), {
      timeout: 5000,
    });
    expect(card.querySelector("pre")?.textContent).toBe("const a = 1;");
  });

  it("leaves an unknown language as plain text", async () => {
    render(<Markdown text={"```nosuchlang\nabc\n```"} />);
    const card = screen.getByRole("figure", { name: "nosuchlang" });
    await new Promise((r) => setTimeout(r, 50));
    expect(card.querySelector("[data-token]")).toBeNull();
    expect(card.querySelector("pre")?.textContent).toBe("abc");
  });

  it("styles inline code", () => {
    render(<Markdown text={"run `pnpm dev` now"} />);
    expect(screen.getByText("pnpm dev").tagName).toBe("CODE");
  });

  it("opens a project file link in the workspace panel", () => {
    const open = vi.fn();
    render(
      <OpenFileContext.Provider value={open}>
        <Markdown
          text="See [the guide](guide/intro.md#L4) and [web](https://x.y)."
          baseDir="docs"
        />
      </OpenFileContext.Provider>,
    );
    fireEvent.click(screen.getByRole("link", { name: "the guide" }));
    expect(open).toHaveBeenCalledWith({ path: "docs/guide/intro.md", line: 4 });
    expect(screen.getByRole("link", { name: "web" })).toHaveAttribute("target", "_blank");
  });

  it("keeps a link naming a line, but still drops unsafe schemes", () => {
    const open = vi.fn();
    render(
      <OpenFileContext.Provider value={open}>
        <Markdown text="[line](src/a.ts:12) [bad](javascript:alert.x:1) [mail](mailto:a@b.c)" />
      </OpenFileContext.Provider>,
    );
    fireEvent.click(screen.getByRole("link", { name: "line" }));
    expect(open).toHaveBeenCalledWith({ path: "src/a.ts", line: 12 });
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.queryByRole("link", { name: "mail" })).toBeNull();
  });

  it("leaves a file link as text where there is no panel", () => {
    render(<Markdown text="See [the guide](guide/intro.md)." />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("the guide")).toBeInTheDocument();
  });
});
