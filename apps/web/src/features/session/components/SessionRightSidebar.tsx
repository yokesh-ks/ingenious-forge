import { useState } from "react";
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
 * The session's workspace panel (changes/files/terminal), promoted to an
 * app-wide right sidebar. Nests its own SidebarProvider so its open/close
 * state is independent of the left sidebar's.
 */
export default function SessionRightSidebar({
  projectId,
  changedFiles,
  onRevertAll,
  busy,
}: SessionRightSidebarProps) {
  const [tab, setTab] = useState<PanelTab>("changes");
  const [terminalOpened, setTerminalOpened] = useState(false);

  return (
    <SidebarProvider className="contents">
      <SidebarTrigger aria-label="Toggle workspace panel" className="self-start" />
      <Sidebar side="right" collapsible="offcanvas">
        <SidebarContent className="gap-3 p-3">
          <div role="tablist" aria-label="Workspace panel" className="flex gap-1 border-b">
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
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
