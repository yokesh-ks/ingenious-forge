import { describe, expect, it } from "vitest";
import {
  buildTrajectory,
  type LedgerRow,
  ledgerRows,
  matchesSearch,
  previewText,
  sessionUsageUpTo,
} from "../../model/build-trajectory";
import { READ_SCHEMA, session } from "../fixture";

const labels = (rows: LedgerRow[]) =>
  rows.map((row) =>
    row.type === "record"
      ? `${row.record.kind}${row.record.kind === "assistant" ? ` #${row.record.request}` : ""}: ${row.record.preview}`
      : `${row.type}: ${row.summary}`,
  );

describe("buildTrajectory", () => {
  it("lists every record in log order with its kind and preview", () => {
    const { records } = buildTrajectory(session());
    expect(
      records.map((r) => `${r.kind} t${r.turn ?? "-"} s${r.step ?? "-"}: ${r.preview}`),
    ).toEqual([
      "system t1 s1: Initial System Prompt",
      "user t1 s1: List the files",
      "context t1 s1: Be brief.",
      "assistant t1 s1: I'll list the files.",
      'tool t1 s1: bash {"command":"ls"} → a.md b.md',
      'tool t1 s1: read {"file_path":"/p/README.md"} → no such file',
      "assistant t1 s2: There are two files.",
      "user t2 s1: Thanks",
      "assistant t2 s1: You're welcome.",
    ]);
  });

  it("numbers requests across the session and keeps their timing and usage", () => {
    const { records } = buildTrajectory(session());
    const replies = records.filter((r) => r.kind === "assistant");
    expect(replies.map((r) => r.request)).toEqual([1, 2, 3]);
    const [first] = replies;
    expect(first).toMatchObject({
      provider: "google",
      model: "gemini",
      maxTokens: 8192,
      startedAt: 1_020,
      endedAt: 2_210,
      firstTokenMs: 600,
      generationMs: 300,
      usage: { input: 1_000, output: 40, cache_read: 3_000, cache_write: 0 },
      toolCalls: 2,
    });
    expect(first.blocks).toEqual([
      { type: "thinking", text: "Look first." },
      { type: "text", text: "I'll list the files." },
      { type: "tool-call", name: "bash", text: '{"command":"ls"}' },
      { type: "tool-call", name: "read", text: '{"file_path":"/p/README.md"}' },
    ]);
  });

  it("pairs a tool call with its result, its reply and its schema", () => {
    const { records } = buildTrajectory(session());
    const read = records.find((r) => r.kind === "tool" && r.callId === "t2");
    const reply = records.find((r) => r.kind === "assistant");
    expect(read).toMatchObject({
      name: "read",
      args: { file_path: "/p/README.md" },
      output: "no such file",
      meta: { path: "/p/README.md", total_lines: 0 },
      status: "failed",
      startedAt: 2_110,
      endedAt: 2_140,
      parentId: reply?.id,
      schema: READ_SCHEMA,
    });
    expect(read?.id).toBe("tool:t2");
  });

  it("marks a call without a result as pending", () => {
    const events = session().slice(0, 7);
    const { records } = buildTrajectory(events);
    const bash = records.find((r) => r.kind === "tool");
    expect(bash).toMatchObject({ status: "pending", output: null, endedAt: null });
  });

  it("keeps a system prompt set during a turn where it happened", () => {
    const events = session();
    const late = { ...events[3], seq: 999, ts: 2_205 };
    const { records } = buildTrajectory([...events.slice(0, 10), late, ...events.slice(10)]);
    const kinds = records.map((r) => r.kind);
    expect(kinds.lastIndexOf("system")).toBeGreaterThan(kinds.indexOf("tool"));
  });

  it("titles later system prompts as updates and keeps each one's tools", () => {
    const events = session();
    const again = { ...events[3], seq: 999, ts: 5_030 };
    const { records } = buildTrajectory([...events.slice(0, 17), again, ...events.slice(17)]);
    const systems = records.filter((r) => r.kind === "system");
    expect(systems.map((r) => r.preview)).toEqual([
      "Initial System Prompt",
      "System Prompt Updated",
    ]);
    expect(systems[0].kind === "system" && systems[0].tools.map((t) => t.name)).toEqual([
      "read",
      "bash",
    ]);
  });

  it("adds up the session's usage up to a request", () => {
    const { records } = buildTrajectory(session());
    expect(sessionUsageUpTo(records, 2)).toEqual({
      input: 3_000,
      output: 50,
      cache_read: 6_000,
      cache_write: 0,
    });
  });
});

describe("ledgerRows", () => {
  it("marks each turn's first row and each request", () => {
    const rows = ledgerRows(buildTrajectory(session()).records, {
      turns: false,
      calls: false,
      query: "",
    });
    const starts = rows.flatMap((r) =>
      r.type === "record" && r.turnStart ? [r.record.preview] : [],
    );
    expect(starts).toEqual(["List the files", "Thanks"]);
  });

  it("folds each reply's calls into one summary row", () => {
    const rows = ledgerRows(buildTrajectory(session()).records, {
      turns: false,
      calls: true,
      query: "",
    });
    expect(labels(rows)).toContain("calls: 2 tool calls · bash, read");
    expect(labels(rows).some((l) => l.startsWith("tool"))).toBe(false);
  });

  it("folds each turn after its message into one summary row", () => {
    const rows = ledgerRows(buildTrajectory(session()).records, {
      turns: true,
      calls: false,
      query: "",
    });
    expect(labels(rows)).toEqual([
      "system: Initial System Prompt",
      "user: List the files",
      "turn: 2 steps · 2 tool calls",
      "user: Thanks",
      "turn: 1 step · 0 tool calls",
    ]);
  });

  it("opens one folded group on its own", () => {
    const records = buildTrajectory(session()).records;
    const folded = ledgerRows(records, { turns: true, calls: false, query: "" });
    const summary = folded.find((r) => r.type === "turn");
    const rows = ledgerRows(records, {
      turns: true,
      calls: false,
      query: "",
      flipped: new Set([summary?.key ?? ""]),
    });
    expect(labels(rows)).toContain("assistant #2: There are two files.");
    expect(labels(rows)).toContain("turn: 1 step · 0 tool calls");
  });

  it("folds one group while the others stay open", () => {
    const records = buildTrajectory(session()).records;
    const rows = ledgerRows(records, {
      turns: false,
      calls: false,
      query: "",
      flipped: new Set(["calls:reply:1", "turn:2"]),
    });
    expect(labels(rows)).toContain("calls: 2 tool calls · bash, read");
    expect(labels(rows)).toContain("turn: 1 step · 0 tool calls");
    expect(labels(rows)).toContain("assistant #2: There are two files.");
  });

  it("keeps rows that match the search and the reply of a matching call", () => {
    const rows = ledgerRows(buildTrajectory(session()).records, {
      turns: false,
      calls: false,
      query: "B.MD",
    });
    expect(labels(rows)).toEqual([
      "assistant #1: I'll list the files.",
      'tool: bash {"command":"ls"} → a.md b.md',
    ]);
  });

  it("searches full text, not only the preview", () => {
    const { records } = buildTrajectory(session());
    const system = records.find((r) => r.kind === "system");
    expect(system && matchesSearch(system, "you are forge")).toBe(true);
  });
});

describe("previewText", () => {
  it("turns Markdown into one plain line", () => {
    expect(
      previewText(
        '## Title\n\nThe name is **"demo"**. Run `dev` — see [docs](https://x.y).\n- one\n- two',
      ),
    ).toBe('Title The name is "demo". Run dev — see docs. one two');
  });

  it("keeps at most 512 characters and marks a cut with an ellipsis", () => {
    const long = "word ".repeat(200);
    const preview = previewText(long);
    expect(preview.length).toBeLessThanOrEqual(513);
    expect(preview.endsWith("…")).toBe(true);
  });
});
