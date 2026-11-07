import { ChevronDownIcon, FolderIcon } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProject } from "@/features/session/hooks/use-project";
import { navigate } from "@/lib/router";

/** The open project's name, with a menu of recent projects to move to. */
export default function ProjectPicker({ projectId }: { projectId: string }) {
  const { project } = useProject(projectId);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The list is read on each opening, so it includes folders opened since.
  function load(open: boolean) {
    if (!open) return;
    setError(null);
    api.recentProjects().then(setProjects, (err: Error) => setError(err.message));
  }

  return (
    <DropdownMenu modal={false} onOpenChange={load}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-w-0"
          aria-label={`Project: ${project?.name ?? "loading"}`}
          title={project?.path}
          disabled={!project}
        >
          <FolderIcon aria-hidden />
          <span className="max-w-48 truncate">{project?.name}</span>
          <ChevronDownIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="max-h-96 w-64 overflow-y-auto">
        <DropdownMenuLabel>Recent projects</DropdownMenuLabel>
        {error && <DropdownMenuItem disabled>{error}</DropdownMenuItem>}
        <DropdownMenuRadioGroup value={projectId}>
          {projects?.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              title={option.path}
              onSelect={() => {
                if (option.id !== projectId) navigate(`/projects/${option.id}`);
              }}
            >
              <span className="truncate">{option.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
