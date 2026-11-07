import {
  ArchiveIcon,
  ArrowUpRightIcon,
  CodeIcon,
  CopyIcon,
  FolderOpenIcon,
  GitForkIcon,
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  SquarePenIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { OpenApp, Project, Session, UpdateSessionRequest } from "@/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RenameDialog from "@/features/session/components/RenameDialog";
import { notifySessionsChanged } from "@/features/session/hooks/use-project-sessions";
import { fileManagerName, shortcutLabel } from "@/lib/platform";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "flex size-5 items-center justify-center rounded-md text-sidebar-foreground outline-hidden hover:bg-sidebar-accent focus-visible:ring-2 ring-sidebar-ring [&>svg]:size-3.5";

interface SessionRowActionsProps {
  session: Session;
  project: Project;
  /** The session open on the page; the keyboard shortcuts act on it. */
  active: boolean;
  /** Where to go when the open session is archived. */
  nextSessionId: string | null;
  /** A failure to show; `null` clears the last one. */
  onError: (message: string | null) => void;
}

/** A session row's icons, shown on hover: its menu, archive and pin. */
export default function SessionRowActions({
  session,
  project,
  active,
  nextSessionId,
  onError,
}: SessionRowActionsProps) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function attempt(action: () => Promise<unknown>) {
    onError(null);
    try {
      await action();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  const update = (change: UpdateSessionRequest) =>
    api.updateSession(session.id, change).then(() => notifySessionsChanged(project.id));

  const togglePin = () => attempt(() => update({ pinned: !session.pinned }));
  const copyId = () => attempt(() => navigator.clipboard.writeText(session.id));
  const openIn = (app: OpenApp) => attempt(() => api.openProjectIn(project.id, app));

  const fork = () =>
    attempt(async () => {
      const created = await api.forkSession(session.id);
      notifySessionsChanged(project.id);
      navigate(`/projects/${project.id}/sessions/${created.id}`);
    });

  const archive = () =>
    attempt(async () => {
      await api.updateSession(session.id, { archived: true });
      notifySessionsChanged(project.id, session.id);
      if (active) {
        navigate(
          nextSessionId
            ? `/projects/${project.id}/sessions/${nextSessionId}`
            : `/projects/${project.id}`,
        );
      }
    });

  // The listener stays put while these handlers change with every render.
  const shortcuts = useRef({ rename: () => setRenaming(true), fork, archive });
  shortcuts.current = { rename: () => setRenaming(true), fork, archive };
  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const run = event.altKey
      ? { KeyG: shortcuts.current.rename, KeyA: shortcuts.current.archive }[event.code]
      : event.shiftKey && event.code === "KeyF"
        ? shortcuts.current.fork
        : undefined;
    if (!run) return;
    event.preventDefault();
    run();
  }, []);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onKeyDown]);

  return (
    <>
      <div
        className={cn(
          "absolute top-1 right-1 flex items-center gap-0.5",
          "group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100",
          menuOpen ? "opacity-100" : "md:opacity-0",
        )}
      >
        <DropdownMenu modal={false} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Session actions"
              aria-label={`Actions for ${session.title}`}
              className={ICON_BUTTON}
            >
              <MoreHorizontalIcon />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            className="w-60"
            // Focus belongs in the dialog an item opens, not back on the trigger.
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuItem onSelect={togglePin}>
              {session.pinned ? <PinOffIcon /> : <PinIcon />}
              {session.pinned ? "Unpin session" : "Pin session"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <SquarePenIcon /> Rename
              <DropdownMenuShortcut>{shortcutLabel("alt", "G")}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={fork}>
              <GitForkIcon /> Fork session
              <DropdownMenuShortcut>{shortcutLabel("shift", "F")}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={copyId}>
              <CopyIcon /> Copy Session ID
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowUpRightIcon /> Open in
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => openIn("file_manager")}>
                  <FolderOpenIcon /> <span className="capitalize">{fileManagerName()}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openIn("vs_code")}>
                  <CodeIcon /> VS Code
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openIn("terminal")}>
                  <SquareTerminalIcon /> Terminal
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={archive}>
              <ArchiveIcon /> Archive session
              <DropdownMenuShortcut>{shortcutLabel("alt", "A")}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          title="Archive session"
          aria-label={`Archive ${session.title}`}
          className={ICON_BUTTON}
          onClick={archive}
        >
          <ArchiveIcon />
        </button>
        <button
          type="button"
          title={session.pinned ? "Unpin session" : "Pin session"}
          aria-label={`${session.pinned ? "Unpin" : "Pin"} ${session.title}`}
          aria-pressed={session.pinned}
          className={ICON_BUTTON}
          onClick={togglePin}
        >
          {session.pinned ? <PinOffIcon /> : <PinIcon />}
        </button>
      </div>
      <RenameDialog
        open={renaming}
        title="Rename session"
        label="Session title"
        initial={session.title}
        onRename={async (title) => {
          await update({ title });
        }}
        onClose={() => setRenaming(false)}
      />
    </>
  );
}
