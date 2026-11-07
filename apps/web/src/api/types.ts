// Generated from server/crates/api-types. Do not edit by hand;
// run `UPDATE_API_TYPES=1 cargo test -p api-types` in server/.

export type JsonValue = number | string | boolean | Array<JsonValue> | { [key in string]: JsonValue } | null;

export type Project = { id: string, name: string, path: string, last_opened_at: number, };

export type ApprovalMode = "ask" | "auto_edit" | "full_auto";

export type SetApprovalModeRequest = { mode: ApprovalMode, };

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type SessionModel = { provider: string, model: string, effort: ReasoningEffort, };

export type SetSessionModelRequest = { model: SessionModel, };

export type ModelOption = { id: string, name: string, 
/**
 * The efforts this model accepts; empty when it has no effort setting.
 */
efforts: Array<ReasoningEffort>, };

export type ProviderOption = { id: string, name: string, models: Array<ModelOption>, };

export type ModelCatalog = { providers: Array<ProviderOption>, 
/**
 * The choice used when a session is created without one; `None` when
 * no provider is configured.
 */
default: SessionModel | null, };

export type CreateSessionRequest = { 
/**
 * The model to use; the saved default when left out.
 */
model: SessionModel | null, 
/**
 * The approval mode; the saved default when left out.
 */
approval_mode: ApprovalMode | null, };

export type SessionDefaults = { 
/**
 * `None` uses the first provider's first model.
 */
model: SessionModel | null, approval_mode: ApprovalMode, };

export type Session = { id: string, project_id: string, title: string, created_at: number, updated_at: number, 
/**
 * True while the agent is working in this session.
 */
running: boolean, 
/**
 * The model the session was started with; `None` for sessions created
 * before models could be picked.
 */
model: SessionModel | null, approval_mode: ApprovalMode, 
/**
 * Pinned sessions stay at the top of the project's list.
 */
pinned: boolean, 
/**
 * Archived sessions are hidden from the list until restored.
 */
archived: boolean, };

export type OpenProjectRequest = { path: string, };

export type RenameProjectRequest = { name: string, };

export type UpdateSessionRequest = { title?: string, pinned?: boolean, archived?: boolean, };

export type OpenApp = "file_manager" | "vs_code" | "terminal";

export type OpenInRequest = { app: OpenApp, };

export type PickedFolder = { path: string | null, };

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

export type KeySource = "settings" | "environment";

export type ProviderKeyStatus = { provider: string, name: string, 
/**
 * One line on what the provider offers.
 */
description: string, 
/**
 * The key's last four characters, when one is set.
 */
hint: string | null, source: KeySource | null, 
/**
 * The environment variable that can hold this provider's key; empty for
 * a custom provider.
 */
env_var: string, 
/**
 * True for a provider the user added.
 */
custom: boolean, 
/**
 * The base URL the user set, if any.
 */
base_url: string | null, 
/**
 * The base URL used when the user sets none.
 */
default_base_url: string, 
/**
 * The model list the user set, if any.
 */
models: Array<ProviderModel> | null, 
/**
 * The models offered when the user sets none.
 */
default_models: Array<ProviderModel>, 
/**
 * Whether the key is good, as of the last save or key test. `None` when
 * there is no key, or a key from the environment has not been tested.
 */
key_valid: boolean | null, };

export type ApiProtocol = "openai_chat" | "openai_responses" | "anthropic_messages";

export type FetchCustomModelsRequest = { base_url: string, protocol: ApiProtocol, key: string, };

export type AddCustomProviderRequest = { id: string, name: string, base_url: string, protocol: ApiProtocol, key: string, 
/**
 * The models to offer, the default first.
 */
models: Array<ProviderModel>, };

export type ProviderKeyTest = { ok: boolean, 
/**
 * Why the test failed, in the provider's words where it gave a reason.
 */
message: string | null, };

export type ProviderModel = { id: string, name: string, };

export type ProviderCustomization = { base_url: string | null, models: Array<ProviderModel> | null, };

export type FetchModelsRequest = { base_url: string | null, key: string | null, };

export type SetProviderKeyRequest = { key: string, };

export type GitHubConnection = { connected: boolean, 
/**
 * The connected account's login.
 */
login: string | null, };

export type ConnectGitHubRequest = { token: string, };

export type GitStatus = { 
/**
 * The current branch, or the short commit when `detached`; `None`
 * only when git cannot tell.
 */
branch: string | null, detached: boolean, 
/**
 * Files with staged changes.
 */
staged: number, 
/**
 * Files with changes not staged, including new files.
 */
changed: number, };

export type CreateBranchRequest = { name: string, };

export type CommitRequest = { message: string, };

export type CommitResult = { 
/**
 * The short commit id.
 */
sha: string, 
/**
 * The first line of the message.
 */
summary: string, };

export type PushResult = { remote: string, 
/**
 * The remote's URL, as git knows it.
 */
url: string, branch: string, };

export type CommitMessageDraft = { message: string, };

export type TerminalInput = { "type": "input", data: string, } | { "type": "resize", cols: number, rows: number, };

export type TerminalNotice = { "type": "exit" };

export type ApiError = { error: string, };

export type ApprovalKind = "edit" | "command";

export type ApprovalDecision = "approve" | "deny" | "always_allow";

export type ClientMessage = { "type": "send_message", session_id: string, text: string, } | { "type": "interrupt", session_id: string, } | { "type": "revert_all", session_id: string, } | { "type": "answer_approval", session_id: string, call_id: string, decision: ApprovalDecision, };

export type OutputStream = "stdout" | "stderr";

export type SandboxInfo = { 
/**
 * `sandbox-exec`, `bubblewrap`, `none` or `unavailable`.
 */
name: string, 
/**
 * True when commands are confined.
 */
active: boolean, 
/**
 * Folders commands may write to.
 */
writable: Array<string>, network: boolean, 
/**
 * Why commands cannot run, when the sandbox is unavailable.
 */
problem: string | null, };

export type Usage = { input: number, output: number, cache_read: number, cache_write: number, };

export type TurnEndReason = { "kind": "completed" } | { "kind": "interrupted" } | { "kind": "error", code: string, message: string, };

export type MessageSource = "human" | "steering";

export type ToolSchema = { name: string, description: string, 
/**
 * The JSON Schema of its arguments.
 */
parameters: JsonValue, };

export type HeaderReason = "first" | "model_changed" | "tools_changed";

export type ModelRef = { provider: string, model: string, };

export type TitleSource = "first_message" | "user";

export type SessionEvent = { "type": "session_started", session_id: string, cwd: string, provider: string, model: string, approval_mode: ApprovalMode, sandbox: SandboxInfo | null, } | { "type": "user_message", session_id: string, text: string, 
/**
 * How it reached the agent; `human` in logs written before ADR 0012.
 */
source: MessageSource, } | { "type": "request_header", session_id: string, provider: string, model: string, max_tokens: number | null, tools: Array<ToolSchema>, reason: HeaderReason, } | { "type": "request_context", session_id: string, provider: string, model: string, context_window: number | null, } | { "type": "system_prompt", session_id: string, text: string, } | { "type": "model_changed", session_id: string, from: ModelRef | null, to: ModelRef, } | { "type": "session_title", session_id: string, title: string, source: TitleSource, } | { "type": "turn_started", session_id: string, turn: number, } | { "type": "step_started", session_id: string, turn: number, step: number, } | { "type": "step_ended", session_id: string, turn: number, step: number, 
/**
 * Token usage the provider reported; `None` when it reported none.
 */
usage: Usage | null, 
/**
 * Step start to the first streamed delta.
 */
first_token_ms: number | null, 
/**
 * First streamed delta to the settled reply.
 */
generation_ms: number | null, } | { "type": "reasoning_delta", session_id: string, turn: number, step: number, chunk: string, } | { "type": "assistant_message", session_id: string, turn: number, step: number, content: Array<JsonValue>, provider: string, model: string, usage: Usage | null, } | { "type": "assistant_attempt", session_id: string, turn: number, step: number, error: string, } | { "type": "turn_ended", session_id: string, turn: number, reason: TurnEndReason, } | { "type": "output", session_id: string, chunk: string, } | { "type": "tool_call", session_id: string, call_id: string, name: string, args: JsonValue, 
/**
 * The turn and step that made the call; 0 in logs written before
 * ADR 0012.
 */
turn: number, step: number, } | { "type": "tool_output", session_id: string, call_id: string, stream: OutputStream, text: string, } | { "type": "tool_result", session_id: string, call_id: string, output: string, is_error: boolean, 
/**
 * The exit code of a shell command; `None` for other tools and
 * for a command that did not exit normally.
 */
exit_code: number | null, 
/**
 * Structured details of the result for the UI, such as the line
 * numbers of a read; `None` for failures and older logs.
 */
meta: JsonValue | null, 
/**
 * When the tool started and finished running, in milliseconds
 * since the Unix epoch; 0 in logs written before ADR 0012.
 */
started_at: number, ended_at: number, } | { "type": "file_changed", session_id: string, path: string, diff: string, additions: number, deletions: number, } | { "type": "changes_reverted", session_id: string, paths: Array<string>, } | { "type": "error", session_id: string, message: string, } | { "type": "done", session_id: string, } | { "type": "interrupted", session_id: string, } | { "type": "approval_mode_changed", session_id: string, mode: ApprovalMode, } | { "type": "approval_requested", session_id: string, call_id: string, kind: ApprovalKind, command: string | null, path: string | null, diff: string | null, } | { "type": "approval_resolved", session_id: string, call_id: string, decision: ApprovalDecision, } | { "type": "sandbox_changed", session_id: string, sandbox: SandboxInfo, };

export type SessionEnvelope = { seq: number, 
/**
 * Milliseconds since the Unix epoch; 0 in logs written before
 * ADR 0012.
 */
ts: number, } & ({ "type": "session_started", session_id: string, cwd: string, provider: string, model: string, approval_mode: ApprovalMode, sandbox: SandboxInfo | null, } | { "type": "user_message", session_id: string, text: string, 
/**
 * How it reached the agent; `human` in logs written before ADR 0012.
 */
source: MessageSource, } | { "type": "request_header", session_id: string, provider: string, model: string, max_tokens: number | null, tools: Array<ToolSchema>, reason: HeaderReason, } | { "type": "request_context", session_id: string, provider: string, model: string, context_window: number | null, } | { "type": "system_prompt", session_id: string, text: string, } | { "type": "model_changed", session_id: string, from: ModelRef | null, to: ModelRef, } | { "type": "session_title", session_id: string, title: string, source: TitleSource, } | { "type": "turn_started", session_id: string, turn: number, } | { "type": "step_started", session_id: string, turn: number, step: number, } | { "type": "step_ended", session_id: string, turn: number, step: number, 
/**
 * Token usage the provider reported; `None` when it reported none.
 */
usage: Usage | null, 
/**
 * Step start to the first streamed delta.
 */
first_token_ms: number | null, 
/**
 * First streamed delta to the settled reply.
 */
generation_ms: number | null, } | { "type": "reasoning_delta", session_id: string, turn: number, step: number, chunk: string, } | { "type": "assistant_message", session_id: string, turn: number, step: number, content: Array<JsonValue>, provider: string, model: string, usage: Usage | null, } | { "type": "assistant_attempt", session_id: string, turn: number, step: number, error: string, } | { "type": "turn_ended", session_id: string, turn: number, reason: TurnEndReason, } | { "type": "output", session_id: string, chunk: string, } | { "type": "tool_call", session_id: string, call_id: string, name: string, args: JsonValue, 
/**
 * The turn and step that made the call; 0 in logs written before
 * ADR 0012.
 */
turn: number, step: number, } | { "type": "tool_output", session_id: string, call_id: string, stream: OutputStream, text: string, } | { "type": "tool_result", session_id: string, call_id: string, output: string, is_error: boolean, 
/**
 * The exit code of a shell command; `None` for other tools and
 * for a command that did not exit normally.
 */
exit_code: number | null, 
/**
 * Structured details of the result for the UI, such as the line
 * numbers of a read; `None` for failures and older logs.
 */
meta: JsonValue | null, 
/**
 * When the tool started and finished running, in milliseconds
 * since the Unix epoch; 0 in logs written before ADR 0012.
 */
started_at: number, ended_at: number, } | { "type": "file_changed", session_id: string, path: string, diff: string, additions: number, deletions: number, } | { "type": "changes_reverted", session_id: string, paths: Array<string>, } | { "type": "error", session_id: string, message: string, } | { "type": "done", session_id: string, } | { "type": "interrupted", session_id: string, } | { "type": "approval_mode_changed", session_id: string, mode: ApprovalMode, } | { "type": "approval_requested", session_id: string, call_id: string, kind: ApprovalKind, command: string | null, path: string | null, diff: string | null, } | { "type": "approval_resolved", session_id: string, call_id: string, decision: ApprovalDecision, } | { "type": "sandbox_changed", session_id: string, sandbox: SandboxInfo, });
