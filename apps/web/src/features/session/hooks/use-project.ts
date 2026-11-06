import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Project } from "@/api/types";

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
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { project, error };
}
