import { FolderGit2Icon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import FolderPicker from "@/features/sandbox/components/FolderPicker";
import { useProjectSessions } from "@/features/session/hooks/use-project-sessions";
import { Link, matchPath, navigate, usePath } from "@/lib/router";
import { timeAgo } from "@/lib/time";

function ProjectSessions({
  projectId,
  activeSessionId,
}: {
  projectId: string;
  activeSessionId: string | null;
}) {
  const { sessions } = useProjectSessions(projectId);

  if (sessions === null) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>;
  }
  if (sessions.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">No sessions yet.</p>;
  }
  return (
    <SidebarMenuSub>
      {sessions.map((session) => (
        <SidebarMenuSubItem key={session.id}>
          <SidebarMenuSubButton asChild isActive={session.id === activeSessionId}>
            <Link
              to={`/projects/${projectId}/sessions/${session.id}`}
              aria-current={session.id === activeSessionId ? "page" : undefined}
            >
              {session.running && (
                <span
                  role="status"
                  aria-label="Running"
                  className="size-2 shrink-0 animate-pulse rounded-full bg-primary"
                />
              )}
              <span className="truncate">{session.title}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {timeAgo(session.updated_at)}
              </span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}

function ProjectTreeItem({
  project,
  activeProjectId,
  activeSessionId,
}: {
  project: Project;
  activeProjectId: string | null;
  activeSessionId: string | null;
}) {
  const isActiveProject = project.id === activeProjectId;
  const [open, setOpen] = useState(isActiveProject);

  useEffect(() => {
    if (isActiveProject) setOpen(true);
  }, [isActiveProject]);

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !isActiveProject) navigate(`/projects/${project.id}`);
      }}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={isActiveProject && !activeSessionId}>
            <FolderGit2Icon />
            <span className="truncate">{project.name}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {open && <ProjectSessions projectId={project.id} activeSessionId={activeSessionId} />}
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/** The left sidebar's project tree: open a folder, pick a project, pick a session. */
export default function ProjectsNav() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const path = usePath();

  useEffect(() => {
    api.recentProjects().then(setProjects, (err: Error) => setError(err.message));
  }, []);

  const sessionMatch = matchPath("/projects/:id/sessions/:sessionId", path);
  const projectMatch = matchPath("/projects/:id", path);
  const activeProjectId = sessionMatch?.id ?? projectMatch?.id ?? null;
  const activeSessionId = sessionMatch?.sessionId ?? null;

  async function open(folderPath: string) {
    setError(null);
    try {
      const project = await api.openProject(folderPath);
      setPicking(false);
      setProjects((prev) => [project, ...(prev ?? []).filter((p) => p.id !== project.id)]);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover open={picking} onOpenChange={setPicking}>
              <PopoverTrigger asChild>
                <SidebarMenuButton>
                  <PlusIcon /> Open folder
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-96">
                <FolderPicker onPick={open} onCancel={() => setPicking(false)} />
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
          {error && (
            <p role="alert" className="px-2 py-1 text-xs text-destructive">
              {error}
            </p>
          )}
          {projects === null && !error && (
            <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
          )}
          {projects?.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No projects yet.</p>
          )}
          {projects?.map((project) => (
            <ProjectTreeItem
              key={project.id}
              project={project}
              activeProjectId={activeProjectId}
              activeSessionId={activeSessionId}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
