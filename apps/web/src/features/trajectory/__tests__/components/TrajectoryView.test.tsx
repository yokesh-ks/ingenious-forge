import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEnvelope } from "@/api/types";
import TrajectoryView from "../../components/TrajectoryView";
import { at, S, session } from "../fixture";

function view(props: Partial<Parameters<typeof TrajectoryView>[0]> = {}) {
  return render(
    <TrajectoryView
      events={session()}
      hasOlder={false}
      loadingOlder={false}
      onLoadOlder={() => {}}
      {...props}
    />,
  );
}

const row = (name: RegExp) => screen.getByRole("row", { name });
const details = () => screen.getByRole("complementary", { name: "Event details" });
const tab = async (name: string) => userEvent.click(within(details()).getByRole("tab", { name }));
const panel = () => within(details()).getByRole("tabpanel");

describe("TrajectoryView", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("lists each record with its kind, turn label and request", () => {
    view();
    expect(row(/^USER, List the files/)).toHaveTextContent("Turn 1");
    expect(row(/^SYSTEM, Initial System Prompt/)).toBeInTheDocument();
    expect(row(/^CONTEXT, Be brief/)).toBeInTheDocument();
    expect(row(/^Request 1, ASSISTANT, I'll list the files/)).toBeInTheDocument();
    expect(row(/^TOOL, bash/)).toHaveTextContent('bash{"command":"ls"}→a.md b.md');
    expect(row(/^TOOL, read/)).toHaveTextContent("30 ms");
    expect(row(/^Request 1, ASSISTANT/)).toHaveTextContent("900 ms · 40 tok");
    expect(row(/^USER, Thanks/)).toHaveTextContent("Turn 2");
  });

  it("inspects a tool call: summary, payload, result, schema and timing", async () => {
    view();
    await userEvent.click(row(/^TOOL, read/));
    expect(details()).toHaveTextContent(/^TOOL\s*Turn 1 · Step 1/);
    expect(
      within(details())
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Summary", "Payload", "Result", "Schema", "Timing"]);
    expect(panel()).toHaveTextContent("HierarchyAssistant Message");
    expect(panel()).toHaveTextContent("StatusFailed");
    expect(panel()).toHaveTextContent('file_path:"/p/README.md"');
    await tab("Result");
    expect(panel()).toHaveTextContent(/Raw result.*total_lines:0.*Rendered result.*no such file/);
    await tab("Schema");
    expect(panel()).toHaveTextContent(
      "readRead a UTF-8 text file and return line-numbered content.",
    );
    expect(panel()).toHaveTextContent("Parameters");
    await tab("Timing");
    expect(panel()).toHaveTextContent(/Started\s*\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}/);
    expect(panel()).toHaveTextContent("Duration30 ms");
    expect(panel()).toHaveTextContent("Timing sourceSession timestamps");
  });

  it("keeps the open tab when another record has it, and follows the hierarchy link", async () => {
    view();
    await userEvent.click(row(/^TOOL, read/));
    await tab("Timing");
    await userEvent.click(row(/^TOOL, bash/));
    expect(within(details()).getByRole("tab", { name: "Timing" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await tab("Summary");
    await userEvent.click(within(panel()).getByRole("button", { name: /Assistant Message/ }));
    expect(details()).toHaveTextContent(/^ASSISTANT/);
  });

  it("inspects a reply's blocks and its request", async () => {
    view();
    await userEvent.click(row(/^Request 1, ASSISTANT/));
    expect(
      within(details())
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Summary", "Preview", "Raw"]);
    expect(panel()).toHaveTextContent("SourceRequest #1");
    expect(panel()).toHaveTextContent("Tokens40 tok");
    expect(panel()).toHaveTextContent("TTFT600 ms");
    await tab("Raw");
    expect(panel()).toHaveTextContent(/Block #1 thinking\s*Look first\./);
    expect(panel()).toHaveTextContent(/Block #3 tool-call/);

    await userEvent.click(screen.getByRole("button", { name: "Request #2" }));
    expect(details()).toHaveTextContent(/^Request #2\s*Turn 1/);
    expect(
      within(details())
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Summary", "Options", "Usage", "Timing"]);
    expect(panel()).toHaveTextContent("Providergoogle");
    await tab("Usage");
    expect(panel()).toHaveTextContent(
      /This request\s*Input\s*5000 tok\s*Cached\s*3000 tok\s*Other\s*2000 tok\s*Output\s*10 tok/,
    );
    expect(panel()).toHaveTextContent(/Session cumulative\s*Input\s*9000 tok/);
  });

  it("shows a system prompt and its tools", async () => {
    view();
    await userEvent.click(row(/^SYSTEM/));
    expect(panel()).toHaveTextContent("You are Forge.");
    await tab("Tools");
    expect(panel()).toHaveTextContent("readRead a UTF-8 text file");
  });

  it("closes the inspector", async () => {
    view();
    await userEvent.click(row(/^TOOL, read/));
    await userEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("complementary", { name: "Event details" })).not.toBeInTheDocument();
  });

  it("opens the record named in the URL, as Inspect does", () => {
    window.history.replaceState(null, "", "/?view=trajectory&record=tool:t1");
    view();
    expect(details()).toHaveTextContent(/^TOOL/);
    expect(row(/^TOOL, bash/)).toHaveAttribute("aria-selected", "true");
  });

  it("folds calls and turns, and opens one folded group", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "Collapse calls" }));
    expect(screen.queryByRole("row", { name: /^TOOL/ })).not.toBeInTheDocument();
    expect(row(/^Collapsed assistant summary, 2 tool calls · bash, read/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand calls" }));
    await userEvent.click(screen.getByRole("button", { name: "Collapse turns" }));
    const folded = row(/^Collapsed turn summary, 2 steps · 2 tool calls/);
    await userEvent.click(folded);
    expect(row(/^Request 2, ASSISTANT/)).toBeInTheDocument();
  });

  it("folds one reply's calls or one turn on double-click", async () => {
    view();
    await userEvent.dblClick(row(/^Request 1, ASSISTANT/));
    expect(row(/^Collapsed assistant summary, 2 tool calls/)).toBeInTheDocument();
    await userEvent.click(row(/^Collapsed assistant summary/));
    expect(row(/^TOOL, bash/)).toBeInTheDocument();
    await userEvent.dblClick(row(/^USER, Thanks/));
    expect(row(/^Collapsed turn summary, 1 step · 0 tool calls/)).toBeInTheDocument();
  });

  it("marks the selected record's turn", async () => {
    view();
    await userEvent.click(row(/^TOOL, read/));
    expect(row(/^USER, List the files/)).toHaveAttribute("data-active-turn", "true");
    expect(row(/^USER, Thanks/)).not.toHaveAttribute("data-active-turn");
    expect(screen.getByRole("button", { name: "Request #1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("resizes the inspector by keyboard and resets on double-click", async () => {
    // jsdom has no pointer capture; a double-click starts and ends a drag.
    Element.prototype.setPointerCapture = vi.fn();
    view();
    await userEvent.click(row(/^TOOL, read/));
    const handle = screen.getByRole("separator", { name: "Resize event details" });
    handle.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(details().style.width).toBe("320px");
    await userEvent.dblClick(handle);
    expect(details().style.width).toBe("");
  });

  it("renders only the latest rows of a long ledger, revealing more on request", async () => {
    const many: SessionEnvelope[] = Array.from({ length: 250 }, (_, i) =>
      at(1_000 + i, { type: "user_message", session_id: S, text: `m${i}`, source: "human" }),
    );
    view({ events: many });
    expect(screen.getAllByRole("row")).toHaveLength(200);
    expect(row(/^USER, m249/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
    expect(screen.getAllByRole("row")).toHaveLength(250);
  });

  it("keeps the rows in view when earlier ones are revealed", async () => {
    const many: SessionEnvelope[] = Array.from({ length: 250 }, (_, i) =>
      at(1_000 + i, { type: "user_message", session_id: S, text: `m${i}`, source: "human" }),
    );
    view({ events: many });
    const pane = screen.getByRole("table", { name: "Trajectory ledger" })
      .parentElement as HTMLElement;
    Object.defineProperty(pane, "scrollHeight", {
      configurable: true,
      get: () => pane.querySelectorAll("tr").length * 30,
    });
    pane.scrollTop = 12;
    fireEvent.scroll(pane);
    await userEvent.click(within(pane).getByRole("button", { name: "Load earlier history" }));
    expect(pane.scrollTop).toBe(12 + 50 * 30);
  });

  it("narrows the ledger to rows matching the search", async () => {
    view();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search trajectory" }), "b.md");
    expect(
      screen.getAllByRole("row").map((r) => r.getAttribute("aria-label")?.slice(0, 20)),
    ).toEqual(["Request 1, ASSISTANT", 'TOOL, bash {"command']);
  });

  it("says it is loading until the history arrives", () => {
    const { rerender } = view({ events: [], loaded: false });
    expect(screen.getByRole("status")).toHaveTextContent("Loading trajectory…");
    rerender(
      <TrajectoryView
        events={[]}
        loaded
        hasOlder={false}
        loadingOlder={false}
        onLoadOlder={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^No records yet/);
  });

  describe("timeline", () => {
    const track = () => screen.getByLabelText(/^Timeline overview/);
    const span = (id: string) =>
      document.querySelector(`[data-timeline-id="${id}"]`) as HTMLElement;
    function sized() {
      vi.spyOn(track(), "getBoundingClientRect").mockReturnValue({
        left: 0,
        width: 900,
      } as DOMRect);
    }
    const drag = (from: number, to: number) => {
      fireEvent.pointerDown(track(), { button: 0, clientX: from, pointerId: 1 });
      fireEvent.pointerMove(track(), { clientX: to, pointerId: 1 });
      fireEvent.pointerUp(track(), { clientX: to, pointerId: 1 });
    };

    beforeEach(() => {
      Element.prototype.setPointerCapture = vi.fn();
      window.localStorage.removeItem("forge.trajectory.duration");
    });

    const focusOf = (name: RegExp) => row(name).getAttribute("data-timeline-focus");

    it("draws lanes, dims rows outside a dragged range and clears with Escape", () => {
      view();
      expect(screen.getByRole("region", { name: "Trajectory timeline" })).toHaveTextContent(
        /Input\s*Model\s*Tools/,
      );
      expect(focusOf(/^TOOL, bash/)).toBeNull();
      sized();
      // Nine equal slots of 100px; the two tool calls fill 400-600.
      drag(450, 550);
      expect(focusOf(/^TOOL, bash/)).toBe("inside");
      expect(focusOf(/^TOOL, read/)).toBe("inside");
      expect(focusOf(/^USER, Thanks/)).toBe("outside");
      expect(row(/^USER, Thanks/)).toHaveClass("opacity-[0.24]");
      expect(screen.getAllByRole("row")).toHaveLength(9);
      fireEvent.keyDown(track(), { key: "Escape" });
      expect(focusOf(/^USER, Thanks/)).toBeNull();
    });

    it("scrolls to the focused rows when a range is selected", () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      view();
      sized();
      drag(450, 550);
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
      // @ts-expect-error jsdom has no scrollIntoView to put back
      delete Element.prototype.scrollIntoView;
    });

    it("clears the range on double-click and on a right-click without moving", () => {
      view();
      sized();
      drag(450, 550);
      fireEvent.doubleClick(track());
      expect(focusOf(/^USER, Thanks/)).toBeNull();
      drag(450, 550);
      fireEvent.pointerDown(track(), { button: 2, clientX: 300, pointerId: 2 });
      fireEvent.pointerUp(track(), { clientX: 300, pointerId: 2 });
      expect(focusOf(/^USER, Thanks/)).toBeNull();
    });

    it("keeps the range when a row inside it is selected, and clears it otherwise", async () => {
      view();
      sized();
      drag(450, 550);
      await userEvent.click(row(/^TOOL, read/));
      expect(focusOf(/^USER, Thanks/)).toBe("outside");
      await userEvent.click(row(/^USER, Thanks/));
      expect(focusOf(/^USER, Thanks/)).toBeNull();
    });

    it("selects a clicked block and outlines the selected record", () => {
      view();
      sized();
      const bar = span("tool:t2");
      fireEvent.pointerDown(bar, { button: 0, clientX: 550, pointerId: 1 });
      fireEvent.pointerUp(bar, { clientX: 550, pointerId: 1 });
      expect(details()).toHaveTextContent(/^TOOL/);
      expect(span("tool:t2")).toHaveAttribute("data-current", "true");
    });

    it("zooms with the wheel, keeping the view inside the session", () => {
      view();
      sized();
      const lanes = () => (span("tool:t1").parentElement as HTMLElement).style.width;
      expect(lanes()).toBe("100%");
      fireEvent.wheel(track(), { deltaY: -300, clientX: 450 });
      expect(Number.parseFloat(lanes())).toBeGreaterThan(100);
    });

    it("switches between equal widths and recorded durations, and remembers", async () => {
      const { unmount } = view();
      const toggle = screen.getByRole("button", { name: "Use actual duration" });
      const equal = span("tool:t1").style.getPropertyValue("--span-width");
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(span("tool:t1").style.getPropertyValue("--span-width")).not.toBe(equal);
      unmount();
      view();
      expect(screen.getByRole("button", { name: "Use actual duration" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("dims blocks that do not match the search", async () => {
      view();
      await userEvent.type(screen.getByRole("searchbox", { name: "Search trajectory" }), "b.md");
      expect(span("tool:t1")).toHaveAttribute("data-search-match", "true");
      expect(span("reply:2.1")).toHaveAttribute("data-search-match", "false");
    });

    it("offers earlier history at the left edge", async () => {
      const onLoadOlder = vi.fn();
      view({ hasOlder: true, onLoadOlder });
      const region = screen.getByRole("region", { name: "Trajectory timeline" });
      await userEvent.click(within(region).getByRole("button", { name: "Load earlier history" }));
      expect(onLoadOlder).toHaveBeenCalled();
    });

    it("says when there is nothing to draw", () => {
      view({ events: [] });
      expect(screen.getByRole("region", { name: "Trajectory timeline" })).toHaveTextContent(
        "No timing data",
      );
    });
  });

  it("loads earlier history on request", async () => {
    const onLoadOlder = vi.fn();
    view({ hasOlder: true, onLoadOlder });
    const ledger = screen.getByRole("region", { name: "Trajectory" });
    await userEvent.click(
      within(ledger).getAllByRole("button", { name: "Load earlier history" })[1],
    );
    expect(onLoadOlder).toHaveBeenCalled();
  });
});
