import { FolderOpenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import FolderPicker from "@/components/FolderPicker";
import { Button } from "@/components/ui/button";
import { Link, navigate } from "@/lib/router";
import { timeAgo } from "@/lib/time";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api.recentProjects().then(setProjects, (err: Error) => setError(err.message));
  }, []);

  async function open(path: string) {
    setError(null);
    try {
      const project = await api.openProject(path);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Recent projects</h2>
        {!picking && (
          <Button onClick={() => setPicking(true)}>
            <FolderOpenIcon /> Open folder
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {picking && <FolderPicker onPick={open} onCancel={() => setPicking(false)} />}
      {projects === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {projects?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No projects yet. Open a git repository folder to start.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {projects?.map((project) => (
          <li key={project.id}>
            <Link
              to={`/projects/${project.id}`}
              className="flex items-baseline gap-3 rounded-md px-3 py-2 hover:bg-muted"
            >
              <span className="font-medium">{project.name}</span>
              <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {project.path}
              </code>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(project.last_opened_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
