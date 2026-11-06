import { useEffect, useState } from "react";
import { api } from "@/api/client";

/** A session's title, for display (e.g. the breadcrumb header). */
export function useSessionTitle(projectId: string | null, sessionId: string | null) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null || sessionId === null) {
      setTitle(null);
      return;
    }
    let cancelled = false;
    api.listSessions(projectId).then(
      (sessions) => {
        if (!cancelled) setTitle(sessions.find((s) => s.id === sessionId)?.title ?? null);
      },
      () => {
        // Breadcrumb falls back to the id; no need to surface this error twice.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, sessionId]);

  return title;
}
