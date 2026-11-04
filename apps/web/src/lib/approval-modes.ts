import type { ApprovalMode } from "@/api/types";

/** The approval modes, least autonomous first (PRD §6.1 Approval modes). */
export const APPROVAL_MODES: { mode: ApprovalMode; label: string; description: string }[] = [
  { mode: "ask", label: "Ask", description: "Approve every edit and command." },
  {
    mode: "auto_edit",
    label: "Auto-edit",
    description: "Edits apply freely; commands need approval.",
  },
  {
    mode: "full_auto",
    label: "Full-auto",
    description: "Everything runs inside the sandbox without prompts.",
  },
];

export function approvalModeLabel(mode: ApprovalMode): string {
  return APPROVAL_MODES.find((m) => m.mode === mode)?.label ?? mode;
}
