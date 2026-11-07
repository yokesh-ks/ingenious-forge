import {
  FolderOpenIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuAction } from "@/components/ui/sidebar";
import RenameDialog from "@/features/session/components/RenameDialog";
import { notifyProjectChanged } from "@/features/session/hooks/use-project";
import { notifySessionsChanged } from "@/features/session/hooks/use-project-sessions";
import { fileManagerName } from "@/lib/platform";
import { navigate } from "@/lib/router";

interface ProjectRowActionsProps {
  project: Project;
  onSessionCreated: () => void;
  onRenamed: (project: Project) => void;
  onDeleted: (projectId: string) => void;
  /** A failure with nowhere of its own to show; `null` clears the last one. */
  onError: (message: string | null) => void;
}

/** A project row's icons: start a session, and the menu of project actions. */
export default function ProjectRowActions({
  project,
  onSessionCreated,
  onRenamed,
  onDeleted,
  onError,
}: ProjectRowActionsProps) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openDialog(next: "rename" | "delete") {
    setDialogError(null);
    setDialog(next);
  }

  async function newSession() {
    onError(null);
    setBusy(true);
    try {
      const created = await api.createSession(project.id);
      notifySessionsChanged(project.id);
      onSessionCreated();
      navigate(`/projects/${project.id}/sessions/${created.id}`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    onError(null);
    try {
      await api.openProjectIn(project.id, "file_manager");
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function rename(name: string) {
    const renamed = await api.renameProject(project.id, name);
    notifyProjectChanged(renamed);
    onRenamed(renamed);
  }

  async function deleteWorkspace() {
    setBusy(true);
    setDialogError(null);
    try {
      await api.deleteProject(project.id);
      setDialog(null);
      onDeleted(project.id);
    } catch (err) {
      setDialogError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            showOnHover
            className="right-7"
            title="Project actions"
            aria-label={`Actions for ${project.name}`}
          >
            <MoreHorizontalIcon />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          className="w-52"
          // Focus belongs in the dialog an item opens, not back on the trigger.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem onSelect={() => openDialog("rename")}>
            <SquarePenIcon /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={reveal}>
            <FolderOpenIcon /> Show in {fileManagerName()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => openDialog("delete")}>
            <Trash2Icon /> Delete workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SidebarMenuAction
        showOnHover
        type="button"
        title="New session"
        aria-label={`New session in ${project.name}`}
        disabled={busy}
        className="disabled:opacity-50"
        onClick={newSession}
      >
        <PlusIcon />
      </SidebarMenuAction>

      <RenameDialog
        open={dialog === "rename"}
        title="Rename project"
        description="This changes the name in Forge. The folder on disk keeps its name."
        label="Project name"
        initial={project.name}
        onRename={rename}
        onClose={() => setDialog(null)}
      />

      <AlertDialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace "{project.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project and its session history from Forge and can't be undone. The
              folder and its files at {project.path} stay on disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialogError && (
            <p role="alert" className="text-sm text-destructive">
              {dialogError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                // Stay open until the server answers, to show a refusal here.
                event.preventDefault();
                deleteWorkspace();
              }}
            >
              Delete workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
