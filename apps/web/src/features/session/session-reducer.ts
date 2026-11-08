import type {
  FileChange as ApiFileChange,
  ApprovalDecision,
  ApprovalKind,
  JsonValue,
  OutputStream,
  Question,
  QuestionAnswer,
  SessionEvent,
  TodoItem,
} from "@/api/types";
import { approvalModeLabel } from "@/lib/approval-modes";

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Set on a user message typed while a turn ran. */
  steering?: true;
}

/** A block of the model's reasoning, as it streamed. */
export interface ReasoningItem {
  id: string;
  role: "reasoning";
  text: string;
}

/** Context the model was given apart from the conversation, such as the
 * project instructions in its system prompt. */
export interface ContextItem {
  id: string;
  role: "context";
  /** What kind of context, such as `system-prompt`. */
  kind: string;
  /** A short description, such as the instruction files it holds. */
  summary: string;
  text: string;
}

/** One turn: where its items start in the timeline, when it ran and how
 * it ended. */
export interface TurnRecord {
  turn: number;
  /** Index in `messages` of the turn's first item. */
  start: number;
  /** Logged times in ms since the epoch; `null` when unknown. */
  startedAt: number | null;
  endedAt: number | null;
  status: "running" | "completed" | "failed" | "stopped";
  /** Why a failed turn failed; `code` is `null` in older logs. */
  failure: { code: string | null; message: string } | null;
}

/** A tool call the agent made, with its result once it arrives. */
export interface ToolItem {
  id: string;
  role: "tool";
  callId: string;
  name: string;
  args: JsonValue;
  status: "running" | "done" | "error";
  output: string | null;
  /** The newest output lines a shell command streamed, oldest first. */
  lines: OutputLine[];
  /** Earlier lines dropped to keep at most `MAX_SHELL_LINES`. */
  hiddenLines: number;
  /** A shell command's exit code once it finished normally. */
  exitCode: number | null;
  /** The approval card for this call, when one was shown. */
  approval: Approval | null;
  /** Structured details of the result, such as a read's lines. */
  meta: JsonValue | null;
  /** The question card an `ask_user_question` call showed. */
  question: QuestionCard | null;
  /** The plan a `todo_write` call wrote. */
  todos: TodoItem[] | null;
}

/** A question card: what the agent asked and, once answered, the answers. */
export interface QuestionCard {
  questions: Question[];
  answers: QuestionAnswer[] | null;
  status: "pending" | "answered" | "cancelled";
}

/** An approval card: what it asks about and, once answered, the answer. */
export interface Approval {
  kind: ApprovalKind;
  command: string | null;
  path: string | null;
  diff: string | null;
  status: "pending" | ApprovalDecision;
}

/** Shell lines kept per tool call, so long output stays fast to render. */
export const MAX_SHELL_LINES = 1000;

export interface OutputLine {
  stream: OutputStream;
  text: string;
}

/** A line about the session itself, such as an interrupted turn. */
export interface SessionNotice {
  id: string;
  role: "notice";
  text: string;
}

/** A file the agent changed this session and its diff from before. */
export type FileChange = ApiFileChange;

export type SessionItem = SessionMessage | ReasoningItem | ContextItem | ToolItem | SessionNotice;

export interface SessionState {
  /** The session timeline: messages and tool calls in arrival order. */
  messages: SessionItem[];
  running: boolean;
  error: string | null;
  /** Id of the assistant message the current turn is streaming into. */
  streamingId: string | null;
  /** Files the agent changed, in the order it first edited them. */
  changedFiles: FileChange[];
  /** The session's turns in order. */
  turns: TurnRecord[];
}

export type SessionAction =
  | { kind: "send"; text: string }
  | { kind: "event"; event: SessionEvent }
  /** Several events at once, such as a backlog loaded on connect. */
  | { kind: "events"; events: SessionEvent[] }
  /** Rebuild the timeline from `events`, such as after loading an older
   * page. The changed files are kept: older events cannot change them. */
  | { kind: "reset"; events: SessionEvent[] }
  /** The session's changed files as the server lists them. */
  | { kind: "changes"; files: FileChange[] }
  | { kind: "local_error"; message: string };

export const initialSessionState: SessionState = {
  messages: [],
  running: false,
  error: null,
  streamingId: null,
  changedFiles: [],
  turns: [],
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.kind) {
    case "send":
      // The message appears when the server echoes it as `user_message`,
      // so the live view and a resumed session show the same thing.
      return { ...state, running: true, error: null };
    case "local_error":
      return { ...state, running: false, error: action.message, streamingId: null };
    case "event":
      return applyEvents(state, [action.event]);
    case "events":
      return applyEvents(state, action.events);
    case "reset":
      return {
        ...applyEvents(initialSessionState, action.events),
        changedFiles: state.changedFiles,
      };
    case "changes":
      return { ...state, changedFiles: action.files };
  }
}

/**
 * Applies events to one copy of the state. The timeline array is copied
 * once per call, not once per event, so loading a long backlog stays
 * linear; items that do not change keep their identity, so the view can
 * skip re-rendering them.
 */
function applyEvents(state: SessionState, events: SessionEvent[]): SessionState {
  const draft: SessionState = {
    ...state,
    messages: state.messages.slice(),
    changedFiles: state.changedFiles,
    turns: state.turns.slice(),
  };
  let changed = false;
  for (const event of events) changed = applyEvent(draft, event) || changed;
  return changed ? draft : state;
}

const nextId = (draft: SessionState) => `m${draft.messages.length}`;

/** Applies one event to `draft` in place; returns whether it changed. */
function applyEvent(draft: SessionState, event: SessionEvent): boolean {
  const items = draft.messages;
  switch (event.type) {
    case "user_message":
      // During a turn this steers it; the reply continues in a new message.
      items.push(
        event.source === "steering"
          ? { id: nextId(draft), role: "user", text: event.text, steering: true }
          : { id: nextId(draft), role: "user", text: event.text },
      );
      draft.streamingId = null;
      return true;
    case "turn_started":
      draft.running = true;
      draft.streamingId = null;
      draft.turns.push({
        turn: event.turn,
        start: items.length,
        startedAt: loggedAt(event),
        endedAt: null,
        status: "running",
        failure: null,
      });
      return true;
    case "system_prompt":
      items.push({
        id: nextId(draft),
        role: "context",
        kind: "system-prompt",
        summary: instructionFiles(event.text),
        text: event.text,
      });
      draft.streamingId = null;
      return true;
    case "output":
      return stream(draft, "assistant", event.chunk);
    case "reasoning_delta":
      return stream(draft, "reasoning", event.chunk);
    case "tool_call":
      // Text after a tool call belongs to a new assistant message.
      draft.streamingId = null;
      items.push({
        id: nextId(draft),
        role: "tool",
        callId: event.call_id,
        name: event.name,
        args: event.args,
        status: "running",
        output: null,
        lines: [],
        hiddenLines: 0,
        exitCode: null,
        approval: null,
        meta: null,
        question: null,
        todos: null,
      });
      return true;
    case "approval_requested": {
      const i = findTool(items, event.call_id);
      if (i === -1) return false;
      items[i] = {
        ...(items[i] as ToolItem),
        approval: {
          kind: event.kind,
          command: event.command,
          path: event.path,
          diff: event.diff,
          status: "pending",
        },
      };
      return true;
    }
    case "approval_resolved": {
      const i = findTool(items, event.call_id);
      const item = items[i] as ToolItem | undefined;
      if (!item?.approval) return false;
      items[i] = { ...item, approval: { ...item.approval, status: event.decision } };
      return true;
    }
    case "question_asked": {
      const i = findTool(items, event.call_id);
      if (i === -1) return false;
      items[i] = {
        ...(items[i] as ToolItem),
        question: { questions: event.questions, answers: null, status: "pending" },
      };
      return true;
    }
    case "question_answered": {
      const i = findTool(items, event.call_id);
      const item = items[i] as ToolItem | undefined;
      if (!item?.question) return false;
      items[i] = {
        ...item,
        question: {
          ...item.question,
          answers: event.answers,
          status: event.answers ? "answered" : "cancelled",
        },
      };
      return true;
    }
    case "todos_updated": {
      const i = findTool(items, event.call_id);
      if (i === -1) return false;
      items[i] = { ...(items[i] as ToolItem), todos: event.todos };
      return true;
    }
    case "tool_output": {
      const i = findTool(items, event.call_id);
      if (i === -1) return false;
      const item = items[i] as ToolItem;
      const full = item.lines.length >= MAX_SHELL_LINES;
      const lines = full ? item.lines.slice(1) : item.lines.slice();
      lines.push({ stream: event.stream, text: event.text });
      items[i] = { ...item, lines, hiddenLines: item.hiddenLines + (full ? 1 : 0) };
      return true;
    }
    case "tool_result": {
      const i = findTool(items, event.call_id);
      if (i === -1) return false;
      items[i] = {
        ...(items[i] as ToolItem),
        status: event.is_error ? "error" : "done",
        output: event.output,
        // Results logged before exit codes existed have no field.
        exitCode: event.exit_code ?? null,
        meta: event.meta ?? null,
      };
      return true;
    }
    case "changes_reverted": {
      const count = event.paths.length;
      draft.changedFiles = [];
      items.push({
        id: nextId(draft),
        role: "notice",
        text: `Reverted ${count} ${count === 1 ? "file" : "files"}`,
      });
      return true;
    }
    case "approval_mode_changed":
      items.push({
        id: nextId(draft),
        role: "notice",
        text: `Approval mode: ${approvalModeLabel(event.mode)}`,
      });
      return true;
    case "file_changed":
      draft.changedFiles = upsertChange(draft.changedFiles, event);
      return true;
    case "turn_ended":
      // Logs since ADR 0012 end turns this way; older ones use the three
      // events below.
      if (event.reason.kind === "completed") {
        closeTurn(draft, "completed", event);
        return endTurn(draft);
      }
      if (event.reason.kind === "interrupted") {
        closeTurn(draft, "stopped", event);
        return interruptTurn(draft);
      }
      closeTurn(draft, "failed", event, {
        code: event.reason.code,
        message: event.reason.message,
      });
      return failTurn(draft, event.reason.message);
    case "done":
      closeTurn(draft, "completed", event);
      return endTurn(draft);
    case "interrupted":
      closeTurn(draft, "stopped", event);
      return interruptTurn(draft);
    case "error":
      closeTurn(draft, "failed", event, { code: null, message: event.message });
      return failTurn(draft, event.message);
    default:
      return false;
  }
}

/** The time the server logged `event` at, when it is known. */
function loggedAt(event: SessionEvent): number | null {
  const ts = (event as { ts?: number }).ts;
  return typeof ts === "number" && ts > 0 ? ts : null;
}

/** Appends a streamed chunk to the newest item when it is streaming the
 * same kind of text, else starts a new item. */
function stream(draft: SessionState, role: "assistant" | "reasoning", chunk: string): boolean {
  const items = draft.messages;
  // The item being streamed is always the newest: anything added after
  // it (a tool call, a user message) ends the stream.
  const last = items[items.length - 1];
  if (draft.streamingId && last?.id === draft.streamingId && last.role === role) {
    items[items.length - 1] = { ...last, text: last.text + chunk };
    return true;
  }
  const id = nextId(draft);
  items.push({ id, role, text: chunk });
  draft.streamingId = id;
  return true;
}

/** Records how the running turn ended. */
function closeTurn(
  draft: SessionState,
  status: TurnRecord["status"],
  event: SessionEvent,
  failure: TurnRecord["failure"] = null,
) {
  const last = draft.turns[draft.turns.length - 1];
  if (last?.status !== "running") return;
  draft.turns[draft.turns.length - 1] = { ...last, status, endedAt: loggedAt(event), failure };
}

/** The instruction files a system prompt holds, by their tags. */
function instructionFiles(text: string): string {
  const files = [...text.matchAll(/<project_instructions path="([^"]+)">/g)].map((m) => m[1]);
  return files.length > 0 ? files.join(", ") : "system prompt";
}

function endTurn(draft: SessionState): boolean {
  draft.running = false;
  draft.streamingId = null;
  // A question still waiting when the turn ends (say, the server
  // restarted) can no longer be answered. Only this turn's items, back to
  // the user's message, can hold one, so a long backlog stays linear.
  const items = draft.messages;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.role === "user" && !item.steering) break;
    if (item.role === "tool" && item.question?.status === "pending") {
      items[i] = { ...item, question: { ...item.question, status: "cancelled" } };
    }
  }
  return true;
}

function interruptTurn(draft: SessionState): boolean {
  const items = draft.messages;
  for (const [i, item] of items.entries()) {
    if (item.role === "tool" && item.status === "running") {
      items[i] = { ...item, status: "error", output: "Interrupted" };
    }
  }
  items.push({ id: nextId(draft), role: "notice", text: "Turn interrupted" });
  return endTurn(draft);
}

function failTurn(draft: SessionState, message: string): boolean {
  draft.error = message;
  return endTurn(draft);
}

/** The index of the tool call `callId`; results and output follow their
 * call closely, so the search starts from the end. */
function findTool(items: SessionItem[], callId: string): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.role === "tool" && item.callId === callId) return i;
  }
  return -1;
}

function upsertChange(files: FileChange[], event: FileChange): FileChange[] {
  const change = {
    path: event.path,
    diff: event.diff,
    additions: event.additions,
    deletions: event.deletions,
  };
  // An edit that restores the original content leaves nothing to review.
  if (change.diff === "") return files.filter((f) => f.path !== change.path);
  const index = files.findIndex((f) => f.path === change.path);
  if (index === -1) return [...files, change];
  return files.map((f, i) => (i === index ? change : f));
}
