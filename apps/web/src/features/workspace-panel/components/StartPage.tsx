import {
  BoxIcon,
  ChevronDownIcon,
  CompassIcon,
  FolderIcon,
  GitCompareArrowsIcon,
  type LucideIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import type { TerminalShell } from "@/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ctrlShortcutLabel, shortcutLabel } from "@/lib/platform";
import { pickShell, rememberShell } from "../model/shell-choice";
import type { TabKind, TabShell } from "../model/tabs";

type ShellMenu =
  | { phase: "loading" }
  | { phase: "ready"; shells: TerminalShell[]; selected: string | undefined }
  | { phase: "failed"; message: string };

/** The New terminal card: the card opens the remembered shell, and the
 * arrow beside its title lists the installed ones. */
function TerminalEntry({ onOpen }: { onOpen: (shell?: TabShell) => void }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<ShellMenu>({ phase: "loading" });
  const title = "New terminal";
  const description = "Run commands in the Session workspace";

  const load = () => {
    setMenu({ phase: "loading" });
    api.terminalShells().then(
      ({ shells }) => setMenu({ phase: "ready", shells, selected: pickShell(shells)?.path }),
      (err: Error) => setMenu({ phase: "failed", message: err.message }),
    );
  };

  return (
    <div className="relative flex min-h-14 w-[380px] max-w-full items-center gap-3.5 overflow-hidden rounded-xl border-[0.5px] border-border bg-background px-5 py-3.5 hover:bg-muted/60">
      <button
        type="button"
        aria-label={`${title} ${description}`}
        onClick={() => onOpen()}
        className="absolute inset-0 size-full cursor-pointer rounded-xl"
      />
      <span className="pointer-events-none relative flex size-[26px] shrink-0 items-center justify-center text-muted-foreground">
        <SquareTerminalIcon
          aria-hidden
          className="size-[26px] text-blue-600 dark:text-blue-400"
          strokeWidth={1.5}
        />
      </span>
      <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm leading-[1.4]">{title}</span>
          <DropdownMenu
            open={open}
            onOpenChange={(next) => {
              if (next) load();
              setOpen(next);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Choose shell"
                className="pointer-events-auto flex size-5 flex-none items-center justify-center rounded text-muted-foreground/70 hover:bg-muted"
              >
                <ChevronDownIcon aria-hidden className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[136px]">
              {menu.phase === "loading" && (
                <DropdownMenuItem disabled>Loading shells…</DropdownMenuItem>
              )}
              {menu.phase === "failed" && (
                <>
                  <DropdownMenuItem disabled>Terminal error: {menu.message}</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      load();
                    }}
                  >
                    Retry
                  </DropdownMenuItem>
                </>
              )}
              {menu.phase === "ready" && menu.shells.length === 0 && (
                <DropdownMenuItem disabled>No shells available</DropdownMenuItem>
              )}
              {menu.phase === "ready" && menu.shells.length > 0 && (
                <DropdownMenuRadioGroup value={menu.selected}>
                  {menu.shells.map((shell) => (
                    <DropdownMenuRadioItem
                      key={shell.path}
                      value={shell.path}
                      className="py-[7px]"
                      onSelect={() => {
                        rememberShell(shell.path);
                        onOpen(shell);
                      }}
                    >
                      {shell.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        <span className="truncate text-[11px] leading-[1.4] text-muted-foreground">
          {description}
        </span>
      </span>
      <kbd className="pointer-events-none relative shrink-0 text-xs text-muted-foreground">
        {ctrlShortcutLabel("`")}
      </kbd>
    </div>
  );
}

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
  onOpen: (kind: Exclude<TabKind, "start" | "file">, shell?: TabShell) => void;
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
      <TerminalEntry onOpen={(shell) => onOpen("terminal", shell)} />
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
