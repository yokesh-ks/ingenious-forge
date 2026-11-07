import { PanelRightIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import ChangedFilesPanel from "@/features/git/components/ChangedFilesPanel";
import FilesPanel from "@/features/git/components/FilesPanel";
import type { FileChange } from "@/features/session/session-reducer";
import TerminalPanel from "@/features/terminal/components/TerminalPanel";
import { cn } from "@/lib/utils";

type PanelTab = "changes" | "files" | "terminal";

interface SessionRightSidebarProps {
  projectId: string;
  changedFiles: FileChange[];
  onRevertAll: () => void;
  busy: boolean;
}

/**
 * The session's workspace panel (changes/files/terminal): a column beside the
 * chat, or an overlay below the `lg` breakpoint, where it starts closed.
 */
export default function SessionRightSidebar({
  projectId,
  changedFiles,
  onRevertAll,
  busy,
}: SessionRightSidebarProps) {
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [tab, setTab] = useState<PanelTab>("changes");
  const [terminalOpened, setTerminalOpened] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle workspace panel"
        aria-expanded={open}
        className="relative z-20 self-start"
        onClick={() => setOpen((value) => !value)}
      >
        <PanelRightIcon />
      </Button>
      {/* Hidden rather than unmounted, so closing the panel keeps the terminal. */}
      <aside
        aria-label="Workspace panel"
        hidden={!open}
        className={cn(
          "-my-6 -mr-4 min-h-0 w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-sidebar p-3 text-sidebar-foreground",
          "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:my-0 max-lg:mr-0 max-lg:w-full max-lg:max-w-96",
          open && "flex",
        )}
      >
        <div role="tablist" aria-label="Workspace panel tabs" className="flex gap-1 border-b">
          {(["changes", "files", "terminal"] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={cn(
                "-mb-px border-b-2 px-2 py-1 text-sm capitalize",
                tab === name
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground",
              )}
              onClick={() => {
                setTab(name);
                if (name === "terminal") setTerminalOpened(true);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {/* The terminal stays mounted once opened, so switching tabs keeps it. */}
        {terminalOpened && (
          <div className={tab === "terminal" ? "flex min-h-0 flex-1" : "hidden"}>
            <TerminalPanel projectId={projectId} />
          </div>
        )}
        {tab === "terminal" ? null : tab === "files" ? (
          <FilesPanel projectId={projectId} />
        ) : (
          <ChangedFilesPanel files={changedFiles} onRevertAll={onRevertAll} busy={busy} />
        )}
      </aside>
    </>
  );
}
