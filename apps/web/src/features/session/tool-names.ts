/**
 * The kind of a recorded tool call, by its name. Sessions logged before the
 * tools were renamed (`read_file`, `edit_file`, `run_shell`) map to the same
 * kinds as the current names, so old sessions keep rendering.
 */
export type ToolKind = "read" | "write" | "edit" | "list" | "bash" | "other";

const KINDS: Record<string, ToolKind> = {
  read: "read",
  read_file: "read",
  write: "write",
  edit: "edit",
  edit_file: "edit",
  list_directory: "list",
  bash: "bash",
  run_shell: "bash",
};

export function toolKind(name: string): ToolKind {
  return KINDS[name] ?? "other";
}
