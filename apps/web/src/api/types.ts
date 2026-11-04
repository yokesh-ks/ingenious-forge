// Generated from server/crates/api-types. Do not edit by hand;
// run `UPDATE_API_TYPES=1 cargo test -p api-types` in server/.

export type JsonValue = number | string | boolean | Array<JsonValue> | { [key in string]: JsonValue } | null;

export type Project = { id: string, name: string, path: string, last_opened_at: number, };

export type ApprovalMode = "ask" | "auto_edit" | "full_auto";

export type SetApprovalModeRequest = { mode: ApprovalMode, };

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type SessionModel = { provider: string, model: string, effort: ReasoningEffort, };

export type ModelOption = { id: string, name: string, };

export type ProviderOption = { id: string, name: string, models: Array<ModelOption>, };

export type ModelCatalog = { providers: Array<ProviderOption>, efforts: Array<ReasoningEffort>, 
/**
 * The choice used when a session is created without one; `None` when
 * no provider is configured.
 */
default: SessionModel | null, };

export type CreateSessionRequest = { 
/**
 * The model to use; the catalog default when left out.
 */
model: SessionModel | null, };

export type Session = { id: string, project_id: string, title: string, created_at: number, updated_at: number, 
/**
 * True while the agent is working in this session.
 */
running: boolean, 
/**
 * The model the session was started with; `None` for sessions created
 * before models could be picked.
 */
model: SessionModel | null, approval_mode: ApprovalMode, };

export type OpenProjectRequest = { path: string, };

export type DirEntry = { name: string, path: string, is_git_repo: boolean, };

export type DirListing = { path: string, parent: string | null, is_git_repo: boolean, entries: Array<DirEntry>, };

export type FileList = { 
/**
 * `/`-separated paths relative to the project folder, sorted.
 */
files: Array<string>, 
/**
 * True when the project has more files than were listed.
 */
truncated: boolean, };

export type FileContent = { path: string, content: string, };

export type ApiError = { error: string, };

export type ApprovalKind = "edit" | "command";

export type ApprovalDecision = "approve" | "deny" | "always_allow";

export type ClientMessage = { "type": "send_message", session_id: string, text: string, } | { "type": "interrupt", session_id: string, } | { "type": "revert_all", session_id: string, } | { "type": "answer_approval", session_id: string, call_id: string, decision: ApprovalDecision, };

export type OutputStream = "stdout" | "stderr";

export type SessionEvent = { "type": "user_message", session_id: string, text: string, } | { "type": "turn_started", session_id: string, } | { "type": "output", session_id: string, chunk: string, } | { "type": "tool_call", session_id: string, call_id: string, name: string, args: JsonValue, } | { "type": "tool_output", session_id: string, call_id: string, stream: OutputStream, text: string, } | { "type": "tool_result", session_id: string, call_id: string, output: string, is_error: boolean, 
/**
 * The exit code of a shell command; `None` for other tools and
 * for a command that did not exit normally.
 */
exit_code: number | null, } | { "type": "file_changed", session_id: string, path: string, diff: string, additions: number, deletions: number, } | { "type": "changes_reverted", session_id: string, paths: Array<string>, } | { "type": "error", session_id: string, message: string, } | { "type": "done", session_id: string, } | { "type": "interrupted", session_id: string, } | { "type": "approval_mode_changed", session_id: string, mode: ApprovalMode, } | { "type": "approval_requested", session_id: string, call_id: string, kind: ApprovalKind, command: string | null, path: string | null, diff: string | null, } | { "type": "approval_resolved", session_id: string, call_id: string, decision: ApprovalDecision, };

export type SessionEnvelope = { seq: number, } & ({ "type": "user_message", session_id: string, text: string, } | { "type": "turn_started", session_id: string, } | { "type": "output", session_id: string, chunk: string, } | { "type": "tool_call", session_id: string, call_id: string, name: string, args: JsonValue, } | { "type": "tool_output", session_id: string, call_id: string, stream: OutputStream, text: string, } | { "type": "tool_result", session_id: string, call_id: string, output: string, is_error: boolean, 
/**
 * The exit code of a shell command; `None` for other tools and
 * for a command that did not exit normally.
 */
exit_code: number | null, } | { "type": "file_changed", session_id: string, path: string, diff: string, additions: number, deletions: number, } | { "type": "changes_reverted", session_id: string, paths: Array<string>, } | { "type": "error", session_id: string, message: string, } | { "type": "done", session_id: string, } | { "type": "interrupted", session_id: string, } | { "type": "approval_mode_changed", session_id: string, mode: ApprovalMode, } | { "type": "approval_requested", session_id: string, call_id: string, kind: ApprovalKind, command: string | null, path: string | null, diff: string | null, } | { "type": "approval_resolved", session_id: string, call_id: string, decision: ApprovalDecision, });
