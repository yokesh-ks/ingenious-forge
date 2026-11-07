import { CheckIcon, ChevronDownIcon, ShieldIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ApprovalMode } from "@/api/types";
import { Button } from "@/components/ui/button";
import { APPROVAL_MODES, approvalModeLabel } from "@/lib/approval-modes";

interface ApprovalModePickerProps {
  mode: ApprovalMode;
  onChange: (mode: ApprovalMode) => void;
  /** True while a change is being saved. */
  saving?: boolean;
}

/** The session's approval mode, changeable from a small menu. */
export default function ApprovalModePicker({
  mode,
  onChange,
  saving = false,
}: ApprovalModePickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: ApprovalMode) {
    setOpen(false);
    if (next !== mode) onChange(next);
  }

  return (
    <div ref={root} className="relative">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Approval mode: ${approvalModeLabel(mode)}`}
        disabled={saving}
        onClick={() => setOpen((o) => !o)}
      >
        <ShieldIcon aria-hidden />
        {approvalModeLabel(mode)}
        <ChevronDownIcon aria-hidden />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Approval mode"
          className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {APPROVAL_MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="menuitemradio"
              aria-checked={option.mode === mode}
              className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => choose(option.mode)}
            >
              <CheckIcon
                aria-hidden
                className={option.mode === mode ? "mt-0.5 size-4" : "mt-0.5 size-4 invisible"}
              />
              <span className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
