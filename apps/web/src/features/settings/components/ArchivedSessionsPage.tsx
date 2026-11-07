import { formatDistanceToNow } from "date-fns";
import { AlertCircleIcon, ArchiveIcon, Loader2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Session } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

interface ArchivedSessionWithProject extends Session {
  projectName: string;
}

export default function ArchivedSessionsPage() {
  const [sessions, setSessions] = useState<ArchivedSessionWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadArchivedSessions() {
      setLoading(true);
      setError(null);
      try {
        const projects = await api.recentProjects();
        const sessionsByProject = await Promise.all(
          projects.map((project) => api.listSessions(project.id)),
        );
        const allArchived: ArchivedSessionWithProject[] = [];
        projects.forEach((project, index) => {
          const archived = sessionsByProject[index]
            .filter((s) => s.archived)
            .map((s) => ({ ...s, projectName: project.name }));
          allArchived.push(...archived);
        });

        allArchived.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        setSessions(allArchived);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    loadArchivedSessions();
  }, []);

  async function restoreSession(session: ArchivedSessionWithProject) {
    setError(null);
    setPendingIds((prev) => new Set(prev).add(session.id));
    try {
      await api.updateSession(session.id, { archived: false });
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
    }
  }

  async function deleteSession(session: ArchivedSessionWithProject) {
    if (!window.confirm(`Permanently delete "${session.title}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    setPendingIds((prev) => new Set(prev).add(session.id));
    try {
      await api.deleteSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
    }
  }

  function groupByProject(sessions: ArchivedSessionWithProject[]) {
    const groups = new Map<string, ArchivedSessionWithProject[]>();
    for (const session of sessions) {
      const existing = groups.get(session.projectName) ?? [];
      existing.push(session);
      groups.set(session.projectName, existing);
    }
    return groups;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading archived sessions…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-destructive">
        <AlertCircleIcon className="size-6" />
        <span>Failed to load archived sessions: {error}</span>
      </div>
    );
  }

  const grouped = groupByProject(sessions);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ArchiveIcon className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No archived sessions</h3>
        <p className="text-muted-foreground mt-1">
          Sessions you archive will appear here. Archive a session from its menu in the Work
          section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([projectName, projectSessions]) => (
        <div key={projectName} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ArchiveIcon className="size-4" />
            <span>{projectName}</span>
            <Badge variant="secondary" className="ml-auto">
              {projectSessions.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {projectSessions.map((session) => {
              const isPending = pendingIds.has(session.id);
              return (
                <Card key={session.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium truncate">{session.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Archived{" "}
                          {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreSession(session)}
                          disabled={isPending}
                        >
                          <RotateCcwIcon className="size-3.5 mr-1.5" />
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteSession(session)}
                          disabled={isPending}
                        >
                          <Trash2Icon className="size-3.5 mr-1.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
