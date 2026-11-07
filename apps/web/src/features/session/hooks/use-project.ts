import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";

/** Tells every mounted `useProject` of this project to show its new details. */
const PROJECT_CHANGED = "forge:project-changed";

export function notifyProjectChanged(project: Project) {
  window.dispatchEvent(new CustomEvent(PROJECT_CHANGED, { detail: project }));
}

/** The project a route refers to, by id. */
export function useProject(projectId: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      setProject(null);
      return;
    }
    let cancelled = false;
    api.getProject(projectId).then(
      (found) => !cancelled && setProject(found),
      (err: Error) => !cancelled && setError(err.message),
    );
    const onChanged = (event: Event) => {
      const changed = (event as CustomEvent<Project>).detail;
      if (changed.id === projectId) setProject(changed);
    };
    window.addEventListener(PROJECT_CHANGED, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(PROJECT_CHANGED, onChanged);
    };
  }, [projectId]);

  return { project, error };
}
