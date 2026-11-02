// Generated from server/crates/api-types. Do not edit by hand;
// run `UPDATE_API_TYPES=1 cargo test -p api-types` in server/.

export type JsonValue = number | string | boolean | Array<JsonValue> | { [key in string]: JsonValue } | null;

export type Session = { id: string, project_id: string, created_at: string, };

export type ClientMessage = { "type": "send_message", session_id: string, text: string, } | { "type": "interrupt", session_id: string, } | { "type": "revert_all", session_id: string, };

export type SessionEvent = { "type": "turn_started", session_id: string, } | { "type": "output", session_id: string, chunk: string, } | { "type": "tool_call", session_id: string, call_id: string, name: string, args: JsonValue, } | { "type": "tool_result", session_id: string, call_id: string, output: string, is_error: boolean, } | { "type": "file_changed", session_id: string, path: string, diff: string, additions: number, deletions: number, } | { "type": "changes_reverted", session_id: string, paths: Array<string>, } | { "type": "error", session_id: string, message: string, } | { "type": "done", session_id: string, } | { "type": "interrupted", session_id: string, };
