import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(row(/^Request 1, ASSISTANT/)).toHaveTextContent("1.19 s · 40 tok");
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

  it("loads earlier history on request", async () => {
    const onLoadOlder = vi.fn();
    view({ hasOlder: true, onLoadOlder });
    await userEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
    expect(onLoadOlder).toHaveBeenCalled();
  });
});
