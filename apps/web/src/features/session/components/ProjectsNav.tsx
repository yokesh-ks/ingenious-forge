import { ChevronDownIcon, FolderPlusIcon, PinIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import ProjectRowActions from "@/features/session/components/ProjectRowActions";
import SessionRowActions from "@/features/session/components/SessionRowActions";
import { useProjectSessions } from "@/features/session/hooks/use-project-sessions";
import { Link, matchPath, navigate, usePath } from "@/lib/router";

type OnError = (message: string | null) => void;

function ProjectSessions({
  project,
  activeSessionId,
  onError,
}: {
  project: Project;
  activeSessionId: string | null;
  onError: OnError;
}) {
  const { sessions } = useProjectSessions(project.id);

  if (sessions === null) {
    return <p className="py-1 pr-2 pl-4 text-xs text-muted-foreground">Loading…</p>;
  }
  return (
    <>
      {sessions.length === 0 ? (
        <p className="py-1 pr-2 pl-4 text-xs text-muted-foreground">No sessions yet.</p>
      ) : (
        <SidebarMenuSub className="mx-0 translate-x-0 border-l-0 px-0">
          {sessions.map((session) => (
            <SidebarMenuSubItem key={session.id}>
              <SidebarMenuSubButton
                asChild
                isActive={session.id === activeSessionId}
                className="translate-x-0 pl-4 group-focus-within/menu-sub-item:pr-18 group-hover/menu-sub-item:pr-18"
              >
                <Link
                  to={`/projects/${project.id}/sessions/${session.id}`}
                  aria-current={session.id === activeSessionId ? "page" : undefined}
                >
                  {session.running && (
                    <span
                      role="status"
                      aria-label="Running"
                      className="size-2 shrink-0 animate-pulse rounded-full bg-primary"
                    />
                  )}
                  {session.pinned && <PinIcon aria-label="Pinned" className="shrink-0" />}
                  <span className="truncate">{session.title}</span>
                </Link>
              </SidebarMenuSubButton>
              <SessionRowActions
                session={session}
                project={project}
                active={session.id === activeSessionId}
                nextSessionId={sessions.find((s) => s.id !== session.id)?.id ?? null}
                onError={onError}
              />
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </>
  );
}

function ProjectTreeItem({
  project,
  activeProjectId,
  activeSessionId,
  onRenamed,
  onDeleted,
  onError,
}: {
  project: Project;
  activeProjectId: string | null;
  activeSessionId: string | null;
  onRenamed: (project: Project) => void;
  onDeleted: (projectId: string) => void;
  onError: OnError;
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
          <SidebarMenuButton
            isActive={isActiveProject && !activeSessionId}
            className="group-has-data-[sidebar=menu-action]/menu-item:pr-14 data-[state=closed]:[&>svg]:-rotate-90"
          >
            <span className="truncate">{project.name}</span>
            <ChevronDownIcon className="size-3.5! text-muted-foreground transition-transform" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <ProjectRowActions
          project={project}
          onSessionCreated={() => setOpen(true)}
          onRenamed={onRenamed}
          onDeleted={onDeleted}
          onError={onError}
        />
        <CollapsibleContent>
          {open && (
            <ProjectSessions
              project={project}
              activeSessionId={activeSessionId}
              onError={onError}
            />
          )}
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/** The left sidebar's project tree: choose a folder, pick a project, pick a session. */
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

  async function pickFolder() {
    setError(null);
    setPicking(true);
    try {
      const { path: folderPath } = await api.pickFolder();
      if (folderPath === null) return;
      const project = await api.openProject(folderPath);
      setProjects((prev) => [project, ...(prev ?? []).filter((p) => p.id !== project.id)]);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPicking(false);
    }
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sm font-semibold">Projects</SidebarGroupLabel>
      <SidebarGroupAction
        type="button"
        title="Select Project Directory"
        aria-label="Select Project Directory"
        disabled={picking}
        className="disabled:opacity-50"
        onClick={pickFolder}
      >
        <FolderPlusIcon />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
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
              onRenamed={(renamed) =>
                setProjects((prev) => (prev ?? []).map((p) => (p.id === renamed.id ? renamed : p)))
              }
              onDeleted={(id) => {
                setProjects((prev) => (prev ?? []).filter((p) => p.id !== id));
                if (id === activeProjectId) navigate("/");
              }}
              onError={setError}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
