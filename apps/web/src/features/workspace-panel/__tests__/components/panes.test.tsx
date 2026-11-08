import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/fake-fetch";
import WorkspacePanel, { type WorkspacePanelControl } from "../../components/WorkspacePanel";

const mounted = vi.fn();
vi.mock("@/features/terminal/components/TerminalPanel", () => ({
  default: ({ shell }: { shell?: string }) => {
    mounted(shell);
    return <div>terminal running {shell ?? "default"}</div>;
  },
}));

const shells = [
  { name: "zsh", path: "/bin/zsh" },
  { name: "bash", path: "/bin/bash" },
];

function setup() {
  const control: { current: WorkspacePanelControl | null } = { current: null };
  render(
    <WorkspacePanel
      projectId="p1"
      changedFiles={[]}
      onRevertAll={() => {}}
      busy={false}
      control={control}
    />,
  );
  return { control };
}

const panel = () => screen.getByLabelText("Workspace panel");
const strips = () =>
  within(panel())
    .getAllByRole("tablist")
    .map((list) =>
      within(list)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    );
const expand = () => userEvent.click(screen.getByRole("button", { name: "Open right sidebar" }));
const button = (name: string | RegExp) => within(panel()).getAllByRole("button", { name });

beforeEach(() => {
  localStorage.clear();
  mounted.mockClear();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  fakeFetch({
    "GET /api/projects/p1": { id: "p1", name: "p", path: "/work/p" },
    "GET /api/terminal/shells": { shells },
    "GET /api/projects/p1/file": (_: RequestInit | undefined, url: URL) => ({
      body: { path: url.searchParams.get("path"), content: "text" },
    }),
  });
});

describe("splitting the panel", () => {
  it("opens a second pane on Start, and stops at two", async () => {
    setup();
    await expand();
    await userEvent.click(button("Split")[0]);
    expect(strips()).toEqual([["Start"], ["Start"]]);
    for (const split of button("Split")) expect(split).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button("Split")[0]);
    expect(strips()).toEqual([["Start"], ["Start"]]);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Two panes is the limit");
  });

  it("keeps the panel's own controls in the last pane only", async () => {
    setup();
    await expand();
    await userEvent.click(button("Split")[0]);
    expect(button("Fullscreen")).toHaveLength(1);
    expect(button("Collapse right sidebar")).toHaveLength(1);
    const strip = within(panel()).getAllByRole("tablist")[1].parentElement as HTMLElement;
    expect(within(strip).getByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
  });

  it("removes the pane when its last tab closes", async () => {
    setup();
    await expand();
    expect(within(panel()).queryByRole("button", { name: "Close Start" })).toBeNull();
    await userEvent.click(button("Split")[0]);
    await userEvent.click(button("Close Start")[1]);
    expect(strips()).toEqual([["Start"]]);
    expect(button("Split")[0]).toBeEnabled();
  });

  it("opens a file in the pane last used", async () => {
    const { control } = setup();
    await expand();
    await waitFor(() => expect(control.current).not.toBeNull());
    await userEvent.click(button("Split")[0]);
    act(() => control.current?.openFile({ path: "a.txt" }));
    expect(strips()).toEqual([["Start"], ["a.txt"]]);
  });

  it("splits on the shortcut while the panel has focus", async () => {
    setup();
    await expand();
    button("Split")[0].focus();
    fireEvent.keyDown(window, { code: "Backslash", metaKey: true });
    expect(strips()).toEqual([["Start"], ["Start"]]);
  });

  it("does not split on the shortcut from outside the panel", async () => {
    setup();
    await expand();
    fireEvent.keyDown(window, { code: "Backslash", metaKey: true });
    expect(strips()).toEqual([["Start"]]);
  });
});

describe("the shell picker", () => {
  it("opens the default shell from the card, named for it", async () => {
    setup();
    await expand();
    await userEvent.click(button(/^New terminal/)[0]);
    await waitFor(() => expect(strips()).toEqual([["zsh"]]));
    expect(await within(panel()).findByText("terminal running /bin/zsh")).toBeInTheDocument();
  });

  it("lists the installed shells without opening a terminal", async () => {
    setup();
    await expand();
    await userEvent.click(button("Choose shell")[0]);
    await screen.findByRole("menuitemradio", { name: "bash" });
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual(["zsh", "bash"]);
    expect(screen.getByRole("menuitemradio", { name: "zsh" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(mounted).not.toHaveBeenCalled();
  });

  it("opens the chosen shell and remembers it for next time", async () => {
    setup();
    await expand();
    await userEvent.click(button("Choose shell")[0]);
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "bash" }));
    expect(strips()).toEqual([["bash"]]);
    expect(within(panel()).getByText("terminal running /bin/bash")).toBeInTheDocument();

    await userEvent.click(button("New tab")[0]);
    await userEvent.click(button(/^New terminal/)[0]);
    await waitFor(() => expect(strips()).toEqual([["bash", "bash"]]));
  });

  it("falls back to the server's default when the list cannot load", async () => {
    fakeFetch({ "GET /api/projects/p1": { id: "p1", name: "p", path: "/work/p" } });
    setup();
    await expand();
    await userEvent.click(button(/^New terminal/)[0]);
    expect(await within(panel()).findByText("terminal running default")).toBeInTheDocument();
    expect(strips()).toEqual([["Terminal"]]);
  });

  it("offers Retry in the menu when the list fails", async () => {
    fakeFetch({ "GET /api/projects/p1": { id: "p1", name: "p", path: "/work/p" } });
    setup();
    await expand();
    await userEvent.click(button("Choose shell")[0]);
    expect(await screen.findByRole("menuitem", { name: "Retry" })).toBeInTheDocument();
  });

  it("renames a terminal from its tab", async () => {
    setup();
    await expand();
    await userEvent.click(button(/^New terminal/)[0]);
    await waitFor(() => expect(strips()).toEqual([["zsh"]]));
    await userEvent.dblClick(within(panel()).getByRole("tab", { name: "zsh" }));
    const field = within(panel()).getByRole("textbox", { name: "Terminal name" });
    await userEvent.clear(field);
    await userEvent.type(field, "dev server{Enter}");
    expect(strips()).toEqual([["dev server"]]);
  });
});

describe("dragging a tab", () => {
  const rect = (left: number, right: number, top: number, bottom: number) =>
    ({
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
    }) as DOMRect;

  /** Gives the two panes known places: 0-200 and 200-400, strip above 38. */
  function place() {
    for (const element of panel().querySelectorAll<HTMLElement>("[data-pane-strip]")) {
      const first = element === panel().querySelector("[data-pane-strip]");
      element.getBoundingClientRect = () => (first ? rect(0, 200, 0, 38) : rect(200, 400, 0, 38));
    }
    for (const element of panel().querySelectorAll<HTMLElement>("[data-pane-body]")) {
      const first = element === panel().querySelector("[data-pane-body]");
      element.getBoundingClientRect = () =>
        first ? rect(0, 200, 38, 500) : rect(200, 400, 38, 500);
    }
  }

  const drag = async (name: string, x: number, y: number) => {
    const chip = within(panel()).getByRole("tab", { name }).parentElement as HTMLElement;
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
    });
    return () =>
      act(async () => {
        window.dispatchEvent(new MouseEvent("pointerup", { clientX: x, clientY: y }));
      });
  };

  it("moves a tab to the other pane's body", async () => {
    const { control } = setup();
    await expand();
    await waitFor(() => expect(control.current).not.toBeNull());
    act(() => control.current?.openFile({ path: "a.txt" }));
    act(() => control.current?.openFile({ path: "b.txt" }));
    await userEvent.click(button("Split")[0]);
    place();
    const drop = await drag("a.txt", 300, 200);
    expect(within(panel()).getByText("Move here")).toBeInTheDocument();
    await drop();
    expect(strips()).toEqual([["b.txt"], ["Start", "a.txt"]]);
  });

  it("offers both sides of a lone pane and splits on release", async () => {
    const { control } = setup();
    await expand();
    await waitFor(() => expect(control.current).not.toBeNull());
    act(() => control.current?.openFile({ path: "a.txt" }));
    act(() => control.current?.openFile({ path: "b.txt" }));
    place();
    const drop = await drag("a.txt", 150, 200);
    expect(within(panel()).getByText("Add left split")).toBeInTheDocument();
    expect(within(panel()).getByText("Add right split")).toBeInTheDocument();
    await drop();
    expect(strips()).toEqual([["b.txt"], ["a.txt"]]);
  });

  it("does nothing for a press that does not move", async () => {
    const { control } = setup();
    await expand();
    await waitFor(() => expect(control.current).not.toBeNull());
    act(() => control.current?.openFile({ path: "a.txt" }));
    const drop = await drag("a.txt", 11, 10);
    expect(within(panel()).queryByText(/split|Move here/)).toBeNull();
    await drop();
    expect(strips()).toEqual([["a.txt"]]);
  });
});

describe("a tab's menu", () => {
  const openFiles = async (control: { current: WorkspacePanelControl | null }) => {
    await expand();
    for (const path of ["a.txt", "b.txt", "c.txt"]) {
      act(() => control.current?.openFile({ path }));
    }
    await waitFor(() => expect(strips()).toEqual([["a.txt", "b.txt", "c.txt"]]));
  };
  const openMenu = (name: string) =>
    fireEvent.contextMenu(screen.getByRole("tab", { name }).closest("[data-chip]") as Element);

  it("closes the other tabs, or those to the right", async () => {
    const { control } = setup();
    await openFiles(control);
    openMenu("b.txt");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Close Tabs to the Right" }));
    expect(strips()).toEqual([["a.txt", "b.txt"]]);
    openMenu("a.txt");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Close Other Tabs" }));
    expect(strips()).toEqual([["a.txt"]]);
  });

  it("offers nothing to the right of the last tab", async () => {
    const { control } = setup();
    await openFiles(control);
    openMenu("c.txt");
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: "Close Tabs to the Right" })).toBeNull();
  });

  it("closes on a middle click, keeping the selected tab", async () => {
    const { control } = setup();
    await openFiles(control);
    const chip = screen.getByRole("tab", { name: "a.txt" }).closest("[data-chip]") as Element;
    fireEvent(chip, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(strips()).toEqual([["b.txt", "c.txt"]]);
    expect(screen.getByRole("tab", { name: "c.txt" })).toHaveAttribute("aria-selected", "true");
  });

  it("moves focus along the strip with the arrow keys, without selecting", async () => {
    const { control } = setup();
    await openFiles(control);
    screen.getByRole("tab", { name: "c.txt" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "a.txt" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "c.txt" })).toHaveAttribute("aria-selected", "true");
  });

  it("closes the focused tab with the keyboard", async () => {
    const { control } = setup();
    await openFiles(control);
    screen.getByRole("tab", { name: "c.txt" }).focus();
    within(panel()).getByRole("tabpanel", { name: "c.txt" }).focus();
    await userEvent.keyboard("{Meta>}{Alt>}w{/Alt}{/Meta}");
    expect(strips()).toEqual([["a.txt", "b.txt"]]);
  });
});

describe("floating a tab", () => {
  const boxes = () => {
    const grid = panel().querySelector("[data-pane-strip]")?.parentElement as HTMLElement;
    grid.getBoundingClientRect = () => new DOMRect(800, 0, 600, 800);
  };
  const dragOut = async (name: string) => {
    boxes();
    const chip = screen.getByRole("tab", { name }).closest("[data-chip]") as Element;
    fireEvent.pointerDown(chip, { button: 0, clientX: 810, clientY: 10 });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, clientY: 200 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 300, clientY: 200 }));
    });
  };
  const floating = () => document.querySelector("[data-float-panel]") as HTMLElement;

  it("floats a tab released clear of the panel, and sends it back", async () => {
    const { control } = setup();
    await expand();
    act(() => control.current?.openFile({ path: "a.txt" }));
    await dragOut("a.txt");
    expect(strips()).toEqual([["Start"]]);
    expect(floating().style.left).toContain("240px");
    expect(floating().style.width).toContain("380px");
    await userEvent.click(
      within(floating()).getByRole("button", { name: "Send back to the sidebar" }),
    );
    expect(floating()).toBeNull();
    expect(strips()).toEqual([["Start", "a.txt"]]);
  });

  it("keeps floating panels on screen while the sidebar is collapsed", async () => {
    const { control } = setup();
    await expand();
    act(() => control.current?.openFile({ path: "a.txt" }));
    await dragOut("a.txt");
    await userEvent.click(button("Collapse right sidebar")[0]);
    expect(panel().style.visibility).toBe("hidden");
    expect(floating().style.visibility).toBe("visible");
    await userEvent.click(within(floating()).getByRole("button", { name: "Close" }));
    expect(floating()).toBeNull();
  });
});
