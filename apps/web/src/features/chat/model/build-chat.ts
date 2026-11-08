import type { JsonValue } from "@/api/types";
import type {
  ReasoningItem,
  SessionItem,
  SessionMessage,
  SessionNotice,
  SessionState,
  ToolItem,
  TurnRecord,
} from "@/features/session/session-reducer";
import { toolKind } from "@/features/session/tool-names";

/** What a process group's tool calls did, for its title and icon. */
export type Category =
  | "read"
  | "search"
  | "write"
  | "edit"
  | "commands"
  | "webFetch"
  | "plan"
  | "questions"
  | "tools";

const LABELS: Record<Category, { running: string; done: string }> = {
  read: { running: "Reading files", done: "Read files" },
  search: { running: "Searching code", done: "Searched code" },
  write: { running: "Writing files", done: "Wrote files" },
  edit: { running: "Editing files", done: "Edited files" },
  commands: { running: "Running commands", done: "Ran commands" },
  webFetch: { running: "Visiting web pages", done: "Visited web pages" },
  plan: { running: "Updating the plan", done: "Updated the plan" },
  questions: { running: "Waiting for your action", done: "Asked questions" },
  tools: { running: "Calling tools", done: "Called tools" },
};

/** The category of a tool, by name; old names map like the new ones. */
export function category(name: string): Category {
  switch (toolKind(name)) {
    case "read":
      return "read";
    case "search":
    case "list":
      return "search";
    case "write":
      return "write";
    case "edit":
      return "edit";
    case "bash":
      return "commands";
    case "fetch":
      return "webFetch";
    case "plan":
      return "plan";
    case "question":
      return "questions";
    default:
      return "tools";
  }
}

/** A run of reasoning and tool calls between replies. */
export interface ChatGroup {
  kind: "group";
  /** The id of its first item, stable while the group grows. */
  id: string;
  items: (ToolItem | ReasoningItem)[];
  /** The top-ranked category, for the header icon; `null` with no calls. */
  activity: Category | null;
  title: string;
  running: boolean;
  /** Whether an approval or question card in it waits for the user. */
  waiting: boolean;
}

export type TurnNode =
  | ChatGroup
  | { kind: "reply"; item: SessionMessage }
  | { kind: "steer"; item: SessionMessage }
  | { kind: "notice"; item: SessionNotice };

export interface ChatTurn {
  kind: "turn";
  turn: number;
  status: TurnRecord["status"];
  startedAt: number | null;
  /** Start to end, when both times are known. */
  durationMs: number | null;
  /** Whether the turn can fold its process groups away. */
  collapsible: boolean;
  nodes: TurnNode[];
}

/** A top-level entry of the chat: an item outside any turn, or a turn. */
export type ChatNode =
  | { kind: "message"; item: SessionMessage }
  | { kind: "notice"; item: SessionNotice }
  | ChatGroup
  | { kind: "reply"; item: SessionMessage }
  | ChatTurn;

/**
 * The chat view of a session: user messages, then each turn with its
 * process groups and replies (design §4.3).
 */
export function buildChat(state: Pick<SessionState, "messages" | "turns">): ChatNode[] {
  const { messages, turns } = state;
  const out: ChatNode[] = [];
  const first = turns.length > 0 ? turns[0].start : messages.length;
  out.push(...(loose(messages.slice(0, first)) as ChatNode[]));
  turns.forEach((record, i) => {
    const end = i + 1 < turns.length ? turns[i + 1].start : messages.length;
    const items = messages.slice(record.start, end);
    // A typed message that starts the next turn sits before it, outside.
    let tail = items.length;
    while (tail > 0) {
      const item = items[tail - 1];
      if (item.role === "user" && !item.steering) tail--;
      else break;
    }
    out.push(buildTurn(record, items.slice(0, tail)));
    for (const item of items.slice(tail)) {
      out.push({ kind: "message", item: item as SessionMessage });
    }
  });
  return out;
}

/** Items outside any turn, as in sessions logged without turn records. */
function loose(items: SessionItem[]): ChatNode[] {
  const out: ChatNode[] = [];
  for (const node of walk(items, false)) {
    if (node.kind === "steer") out.push({ kind: "message", item: node.item });
    else out.push(node);
  }
  return out;
}

function buildTurn(record: TurnRecord, items: SessionItem[]): ChatTurn {
  const running = record.status === "running";
  const nodes = walk(items, running);
  const firstGroup = nodes.findIndex((n) => n.kind === "group");
  const steeredAfter = firstGroup !== -1 && nodes.slice(firstGroup).some((n) => n.kind === "steer");
  return {
    kind: "turn",
    turn: record.turn,
    status: record.status,
    startedAt: record.startedAt,
    durationMs:
      record.startedAt !== null && record.endedAt !== null
        ? Math.max(0, record.endedAt - record.startedAt)
        : null,
    collapsible: record.status === "completed" && firstGroup !== -1 && !steeredAfter,
    nodes,
  };
}

/** Walks items in order, gathering reasoning and tool calls into groups
 * that replies, steering messages and notices close. */
function walk(items: SessionItem[], running: boolean): TurnNode[] {
  const nodes: TurnNode[] = [];
  let group: (ToolItem | ReasoningItem)[] | null = null;
  const close = () => {
    if (group) nodes.push(makeGroup(group, false));
    group = null;
  };
  for (const item of items) {
    if (item.role === "tool" || item.role === "reasoning") {
      group ??= [];
      group.push(item);
    } else if (item.role === "assistant") {
      // Whitespace between tool calls is not a reply.
      if (item.text.trim() === "") continue;
      close();
      nodes.push({ kind: "reply", item });
    } else if (item.role === "user") {
      close();
      nodes.push({ kind: "steer", item });
    } else {
      close();
      nodes.push({ kind: "notice", item: item as SessionNotice });
    }
  }
  if (group) nodes.push(makeGroup(group, running));
  return nodes;
}

function makeGroup(items: (ToolItem | ReasoningItem)[], last: boolean): ChatGroup {
  const tools = items.filter((i): i is ToolItem => i.role === "tool");
  const categories = tools.map((t) => category(t.name));
  const runningTool = [...tools].reverse().find((t) => t.status === "running");
  const running = last || runningTool !== undefined;
  const ranked = rank(categories);
  return {
    kind: "group",
    id: items[0].id,
    items,
    activity: ranked[0] ?? null,
    title: running
      ? runningTool
        ? LABELS[category(runningTool.name)].running
        : "Analyzing the request"
      : groupTitle(categories),
    running,
    waiting: tools.some(
      (t) => t.approval?.status === "pending" || t.question?.status === "pending",
    ),
  };
}

/** Categories by call count, ties in first-seen order. */
function rank(categories: Category[]): Category[] {
  const counts = new Map<Category, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  // Map keeps first-seen order and sort is stable.
  return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
}

/** A finished group's title from its calls' categories. */
export function groupTitle(categories: Category[]): string {
  const labels = rank(categories).map((c, i) =>
    i === 0 ? LABELS[c].done : LABELS[c].done.toLowerCase(),
  );
  if (labels.length === 0) return "Analysis completed";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  if (labels.length === 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} etc.`;
}

const DETAIL_KEYS = [
  "title",
  "description",
  "objective",
  "task",
  "name",
  "question",
  "prompt",
  "message",
  "command",
  "cmd",
  "query",
  "pattern",
  "url",
  "file_path",
  "path",
  "target",
  "action",
  "status",
];

const PATH_KEYS = new Set(["file_path", "path"]);

/**
 * The detail a row shows after the tool's name: the first non-empty
 * argument in a fixed order. A file path shows its base name and keeps
 * the full path, so the row can link to the file.
 */
export function rowDetail(args: JsonValue): { text: string; path: string | null } {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    for (const key of DETAIL_KEYS) {
      const value = args[key];
      if (typeof value !== "string" || value.trim() === "") continue;
      if (PATH_KEYS.has(key)) {
        const name = value.replace(/\/+$/, "").split("/").pop() || value;
        return { text: name, path: value };
      }
      return { text: value, path: null };
    }
  }
  return { text: "", path: null };
}

/** A finished turn's length: "17s", then "1m 5s" from a minute. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** A running turn's time so far, as m:ss. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A tool's display name in its row. */
export function toolDisplayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name;
}

const DISPLAY_NAMES: Record<string, string> = {
  bash: "Bash",
  run_shell: "Bash",
  read: "Read",
  read_file: "Read",
  write: "Write",
  edit: "Edit",
  edit_file: "Edit",
  glob: "Glob",
  grep: "Grep",
  list_directory: "List",
  web_fetch: "Web fetch",
  todo_write: "Todo",
  ask_user_question: "Question",
};
