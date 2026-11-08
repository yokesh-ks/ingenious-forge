import {
  BoxIcon,
  CompassIcon,
  FolderIcon,
  GitCompareArrowsIcon,
  type LucideIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { ctrlShortcutLabel, shortcutLabel } from "@/lib/platform";
import type { TabKind } from "../model/tabs";

function Entry({
  icon: Icon,
  iconClass,
  title,
  description,
  shortcut,
  disabled,
  hint,
  onPick,
}: {
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  description: string;
  shortcut?: string;
  disabled?: boolean;
  hint?: string;
  onPick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={hint}
      onClick={onPick}
      className="flex min-h-14 w-[380px] max-w-full cursor-pointer items-center gap-3.5 rounded-xl border-[0.5px] border-border bg-background px-5 py-3.5 text-left hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background"
    >
      <span className="flex size-[26px] shrink-0 items-center justify-center text-muted-foreground">
        <Icon aria-hidden className={iconClass ?? "size-[26px]"} strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-sm leading-[1.4]">{title}</span>
        <span className="truncate text-[11px] leading-[1.4] text-muted-foreground">
          {description}
        </span>
      </span>
      {shortcut && <kbd className="shrink-0 text-xs text-muted-foreground">{shortcut}</kbd>}
    </button>
  );
}

/** The panel's front page: a compass over the things it can open. */
export default function StartPage({
  onOpen,
}: {
  onOpen: (kind: Exclude<TabKind, "start">) => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3.5 px-6 after:shrink after:basis-[10%] after:content-['']">
      <CompassIcon aria-hidden className="mb-4 size-14 text-muted-foreground/30" strokeWidth={1} />
      <Entry
        icon={FolderIcon}
        iconClass="size-[26px] text-amber-500"
        title="Workspace files"
        description="Browse files in this session's workspace"
        shortcut={shortcutLabel("alt", "P")}
        onPick={() => onOpen("files")}
      />
      <Entry
        icon={GitCompareArrowsIcon}
        title="Code review and changes"
        description="Review code changes in this session"
        onPick={() => onOpen("changes")}
      />
      <Entry
        icon={SquareTerminalIcon}
        iconClass="size-[26px] text-blue-600 dark:text-blue-400"
        title="New terminal"
        description="Run commands in the Session workspace"
        shortcut={ctrlShortcutLabel("`")}
        onPick={() => onOpen("terminal")}
      />
      <Entry
        icon={BoxIcon}
        title="Session log"
        description="Analyze raw logs and grouped chat messages for the current session"
        disabled
        hint="The Session log is not available yet"
      />
    </div>
  );
}
